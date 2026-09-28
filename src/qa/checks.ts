import { num } from "../compile/escape.ts";
import { measureLoudness } from "../audio/loudness.ts";
import { runChecked } from "../shared/index.ts";
import type { ResolvedTimeline } from "../timeline/index.ts";
import { stageTextBoxes } from "../compile/layers/stage-text.ts";
import type { QaCheck, QaFacts, QaIssue } from "./report.ts";
import { frameArgs, rateValue } from "./artifacts.ts";

export interface CheckOptions { video: string; ffmpeg: string; facts: QaFacts; timeline?: ResolvedTimeline;
  expectAudio?: boolean; strictMotion?: boolean }

function issue(check: QaCheck, code: string, message: string, fix: string, severity: "fail" | "warn",
  extra: Partial<QaIssue> = {}): QaIssue {
  return { id: `${check}-${code}`, check, severity, status: "open", code, message, fix, ...extra };
}

function formatIssues(facts: QaFacts): QaIssue[] {
  const { container, codec, pixFmt, width, height } = facts;
  const standard = ["mp4", "mov"].includes(container) && ["h264", "hevc"].includes(codec);
  const prores = container === "mov" && codec === "prores";
  const webm = container === "webm" && codec === "vp9";
  const allowed = (standard && pixFmt === "yuv420p") || (prores && pixFmt === "yuv422p10le") || (webm && pixFmt === "yuv420p");
  const problems = [];
  if (!allowed) problems.push(`unsupported ${container}/${codec}/${pixFmt}`);
  if (width % 2 || height % 2) problems.push(`odd dimensions ${width}x${height}`);
  if (standard && !facts.faststart) problems.push("moov atom is after mdat");
  return problems.length ? [issue("format", "FORMAT", problems.join("; "), "use a supported codec, even dimensions and faststart", "fail",
    { measured: `${container}/${codec}/${pixFmt}` })] : [];
}

async function filterLog(video: string, ffmpeg: string, type: "video" | "audio", filter: string): Promise<string> {
  const args = ["-hide_banner", "-i", video, type === "video" ? "-vf" : "-af", filter,
    type === "video" ? "-an" : "-vn", "-f", "null", "-"];
  return (await runChecked(ffmpeg, args)).stderr;
}

function blackIssues(log: string, facts: QaFacts, timeline?: ResolvedTimeline): QaIssue[] {
  const out: QaIssue[] = [];
  const fade = timeline?.scenes.some((scene) => scene.transitionIn?.type.startsWith("fade") || scene.transitionOut?.type.startsWith("fade"));
  for (const match of log.matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)) {
    const start = Number(match[1]); const end = Number(match[2]);
    if (fade && (end <= 0.2 || start >= facts.durationS - 0.2)) continue;
    out.push(issue("black", "BLACK", `Black interval ${num(start)}–${num(end)} s`, "inspect source or add an intentional waiver", "fail",
      { range: [start, end], measured: Number(match[3]), threshold: 0.5 }));
  }
  return out;
}

function freezeIssues(log: string, facts: QaFacts, strict: boolean): QaIssue[] {
  const starts = [...log.matchAll(/freeze_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const ends = [...log.matchAll(/freeze_end:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  return starts.flatMap((start, i) => {
    const end = ends[i] ?? facts.durationS;
    return end - start >= 3 ? [issue("frozen", "FROZEN", `Static interval ${num(start)}–${num(end)} s`,
      "check whether the hold is intentional", strict ? "fail" : "warn", { range: [start, end], measured: end - start, threshold: 3 })] : [];
  });
}

function silenceIssues(log: string, facts: QaFacts): QaIssue[] {
  const starts = [...log.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  const ends = [...log.matchAll(/silence_end:\s*([\d.]+)/g)].map((match) => Number(match[1]));
  return starts.map((start, i) => issue("silence", "SILENCE", `Silence ${num(start)}–${num(ends[i] ?? facts.durationS)} s`,
    "confirm the pause is intentional", "warn", { range: [start, ends[i] ?? facts.durationS], threshold: 0.5 }));
}

function textBox(layer: Extract<ResolvedTimeline["scenes"][number]["layers"][number], { type: "text" }>,
  width: number, height: number, scale: number): { x: number; y: number; w: number; h: number } {
  const w = Math.min((layer.maxWidth ?? layer.text.length * layer.size * 0.55) * scale, width);
  const h = layer.size * 1.2 * scale;
  const x = layer.x === "center" ? (width - w) / 2 : layer.align === "right" ? layer.x * scale - w :
    layer.align === "center" ? layer.x * scale - w / 2 : layer.x * scale;
  const y = layer.y === "center" ? (height - h) / 2 : layer.y * scale - h;
  return { x, y, w, h };
}

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

async function sampleBackground(video: string, ffmpeg: string, frame: number, x: number, y: number, fps?: string): Promise<number> {
  const result = await runChecked(ffmpeg, ["-v", "error",
    ...frameArgs(video, frame, rateValue(fps), `crop=2:2:${num(x)}:${num(y)},format=rgb24`),
    "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  return luminance([...result.stdout.subarray(0, 3)]);
}

/** Stage-family text (030): settled boxes from the compiled specs; WCAG 4.5:1 under 40 px, 3:1 for large text; severity warn. */
async function stageContrast(opts: CheckOptions): Promise<QaIssue[]> {
  const t = opts.timeline!;
  const issues: QaIssue[] = [];
  const scale = opts.facts.width / t.width;
  for (const box of stageTextBoxes(t)) {
    const color = /^#([0-9a-f]{6})/i.exec(box.color);
    if (!color) continue;
    const rgb = [0, 2, 4].map((offset) => Number.parseInt(color[1]!.slice(offset, offset + 2), 16));
    const x = Math.max(0, Math.min(opts.facts.width - 2, Math.floor(box.x * scale - 4)));
    const y = Math.max(0, Math.min(opts.facts.height - 2, Math.floor(box.y * scale - 4)));
    const background = await sampleBackground(opts.video, opts.ffmpeg, Math.max(0, Math.min(opts.facts.frames - 1, box.absoluteFrame)), x, y,
      opts.facts.fps);
    const foreground = luminance(rgb);
    const ratio = (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
    const threshold = box.size < 40 ? 4.5 : 3;
    if (ratio < threshold) issues.push(issue("contrast", "CONTRAST", `Stage text in ${box.sceneId} has estimated contrast ${num(ratio)}:1`,
      "choose a more contrasting text colour or theme", "warn", { measured: ratio, threshold,
        range: [box.absoluteFrame * t.fps.den / t.fps.num, box.absoluteFrame * t.fps.den / t.fps.num] }));
  }
  return issues;
}

async function textIssues(opts: CheckOptions): Promise<QaIssue[]> {
  if (!opts.timeline) return [];
  const issues: QaIssue[] = await stageContrast(opts);
  const scale = opts.facts.width / opts.timeline.width;
  for (const scene of opts.timeline.scenes) for (const layer of scene.layers) {
    if (layer.type !== "text") continue;
    const box = textBox(layer, opts.facts.width, opts.facts.height, scale);
    const safeX = opts.facts.width * 0.05; const safeY = opts.facts.height * 0.05;
    if (box.x < safeX || box.y < safeY || box.x + box.w > opts.facts.width - safeX || box.y + box.h > opts.facts.height - safeY) {
      issues.push(issue("text_safe", "TEXT_SAFE", `Text in ${scene.id} crosses the 5% title-safe area`,
        "move or shrink the text", "warn", { range: [layer.absoluteStartSeconds, layer.absoluteEndSeconds] }));
    }
    const color = /^#([0-9a-f]{6})/i.exec(layer.color);
    if (!color) continue;
    const rgb = [0, 2, 4].map((offset) => Number.parseInt(color[1]!.slice(offset, offset + 2), 16));
    const x = Math.max(0, Math.min(opts.facts.width - 2, Math.floor(box.x - 4)));
    const y = Math.max(0, Math.min(opts.facts.height - 2, Math.floor(box.y - 4)));
    const background = await sampleBackground(opts.video, opts.ffmpeg,
      Math.max(0, Math.min(opts.facts.frames - 1, layer.absoluteStartFrame)), x, y, opts.facts.fps);
    const foreground = luminance(rgb);
    const ratio = (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
    if (ratio < 3) issues.push(issue("contrast", "CONTRAST", `Text in ${scene.id} has estimated contrast ${num(ratio)}:1`,
      "choose a more contrasting color or add a backing box", "warn", { measured: ratio, threshold: 3,
        range: [layer.absoluteStartSeconds, layer.absoluteEndSeconds] }));
  }
  return issues;
}

/** Measure all QA checks; absent audio checks are skipped unless audio was expected. */
export async function runChecks(opts: CheckOptions): Promise<{ issues: QaIssue[]; skipped: QaCheck[] }> {
  const issues = formatIssues(opts.facts);
  const skipped: QaCheck[] = [];
  const fps = opts.timeline ? opts.timeline.fps.num / opts.timeline.fps.den : Number(opts.facts.fps.split("/")[0]) /
    Number(opts.facts.fps.split("/")[1]);
  if (opts.timeline && Math.abs(opts.facts.frames - opts.timeline.totalFrames) > 1) {
    issues.push(issue("duration", "DURATION", "Frame count differs from timeline", "render the intended timeline", "fail",
      { measured: opts.facts.frames, threshold: opts.timeline.totalFrames }));
  } else if (!opts.timeline) skipped.push("duration");
  issues.push(...blackIssues(await filterLog(opts.video, opts.ffmpeg, "video",
    "blackdetect=d=0.5:pic_th=0.98:pix_th=0.02"), opts.facts, opts.timeline));
  issues.push(...freezeIssues(await filterLog(opts.video, opts.ffmpeg, "video", "freezedetect=n=-60dB:d=3"),
    opts.facts, opts.strictMotion === true));
  if (!opts.facts.audio) {
    skipped.push("loudness", "av_sync");
    if (opts.expectAudio || opts.timeline?.audio) issues.push(issue("silence", "AUDIO_MISSING", "Expected audio stream is missing",
      "render or mux the timeline audio", "fail"));
    else skipped.push("silence");
  } else {
    issues.push(...silenceIssues(await filterLog(opts.video, opts.ffmpeg, "audio", "silencedetect=noise=-50dB:d=0.5"), opts.facts));
    const stats = await measureLoudness(opts.video, opts.ffmpeg);
    opts.facts.audio.integrated = stats.integrated;
    opts.facts.audio.truePeak = stats.truePeak;
    opts.facts.audio.lra = stats.lra;
    const target = opts.timeline?.audio?.loudness.target ?? -14;
    const peak = opts.timeline?.audio?.loudness.truePeak ?? -1;
    if (Math.abs(stats.integrated - target) > 1) issues.push(issue("loudness", "LOUDNESS_I", "Integrated loudness misses target",
      "run two-pass loudnorm", "warn", { measured: stats.integrated, threshold: target }));
    if (stats.truePeak > peak + 0.5) issues.push(issue("loudness", "LOUDNESS_TP", "Delivered true peak exceeds target",
      "lower the mastering true-peak ceiling", "fail", { measured: stats.truePeak, threshold: peak + 0.5 }));
    if (Math.abs(opts.facts.audio.durationS - opts.facts.durationS) > 1 / fps) issues.push(issue("av_sync", "AV_SYNC",
      "Audio duration differs from video", "mux with the exact video duration", "fail",
      { measured: opts.facts.audio.durationS - opts.facts.durationS, threshold: 1 / fps }));
  }
  if (opts.timeline) issues.push(...await textIssues(opts));
  else skipped.push("text_safe", "contrast");
  return { issues: issues.map((item, i) => ({ ...item, id: `${item.check}-${i + 1}` })), skipped };
}
