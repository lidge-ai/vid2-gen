/** End-to-end visual analysis orchestration, with audio work injected at the boundary. */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { probeMedia, requireFeatures } from "../probe/index.ts";
import type { FfmpegInfo } from "../probe/index.ts";
import { run, Vid2Error } from "../shared/index.ts";
import type { ResolvedTimeline } from "../timeline/index.ts";
import { writeKeyframes, writeSpectrogram } from "./artifacts.ts";
import { measureShots } from "./metrics.ts";
import { AnalyzeReportSchema, beatDeltaMs, buildCuts, buildSummary, nearestDeltaMs } from "./report.ts";
import { resolveShots } from "./shots.ts";
import { writeSheets } from "./sheet.ts";
import type { AnalyzeAudioFn, AnalyzeOptions, AnalyzeReport, AnalyzeShot } from "./types.ts";

export interface RunAnalyzeOptions extends Omit<AnalyzeOptions, "timeline"> {
  timeline?: ResolvedTimeline; ffmpeg: FfmpegInfo; ffprobe: string; analyzeAudio: AnalyzeAudioFn;
}

function tempo(opts: RunAnalyzeOptions, fps: number): { bpm: number | null; offsetS: number } {
  const bpm = opts.bpm ?? opts.timeline?.beat?.bpm ?? null;
  const offsetS = opts.beatOffsetS ?? (opts.timeline?.beat ? opts.timeline.beat.offsetFrames / fps : 0);
  if (bpm !== null && (!Number.isFinite(bpm) || bpm <= 0)) throw new Vid2Error("E_INPUT", "bpm must be positive");
  if (!Number.isFinite(offsetS)) throw new Vid2Error("E_INPUT", "beat offset must be finite");
  return { bpm, offsetS };
}

export async function runAnalyze(opts: RunAnalyzeOptions): Promise<AnalyzeReport> {
  requireFeatures(opts.ffmpeg, { filters: ["scale", "select", "signalstats", "ebur128"] }, "analyze");
  const video = resolve(opts.video), out = resolve(opts.out ?? `${video}.analyze`);
  const media = await probeMedia(video, (_cmd, args, options) => run(opts.ffprobe, args, options));
  if (media.kind !== "video" || !media.fps || !media.frames) throw new Vid2Error("E_INPUT", "analyze needs a video with a known frame rate");
  const fps = media.fps.num / media.fps.den;
  const { bpm, offsetS } = tempo(opts, fps);
  await mkdir(out, { recursive: true });
  const bounded = await resolveShots(video, media.frames, fps, opts.ffmpeg.path, opts.timeline);
  const audio = await opts.analyzeAudio({ video, shots: bounded.shots, ffmpeg: opts.ffmpeg,
    ...(bpm === null ? {} : { bpm }), ...(bpm === null ? {} : { beatOffsetS: offsetS }) });
  const warnings: string[] = audio ? [...audio.warnings] : ["NO_AUDIO"];
  const metrics = await measureShots(video, bounded.shots, opts.ffmpeg.path);
  const keyframes = await writeKeyframes(video, out, bounded.shots, opts.ffmpeg.path, fps);
  const shots: AnalyzeShot[] = bounded.shots.map((span, i) => ({ ...span,
    seconds: span.endS - span.startS, beats: bpm === null ? null : (span.endS - span.startS) * bpm / 60,
    nearestBeatDeltaMs: beatDeltaMs(span.startS, bpm, offsetS),
    nearestOnsetDeltaMs: audio ? nearestDeltaMs(span.startS, audio.onsets) : null,
    ...metrics[i]!, keyframe: keyframes[i]! }));
  const sheets = await writeSheets(out, shots, keyframes, opts.ffmpeg.path);
  let spectrogram: string | null = null;
  if (audio) {
    if (opts.ffmpeg.filters.has("showspectrumpic")) spectrogram = await writeSpectrogram(video, out, opts.ffmpeg.path);
    else warnings.push("SPECTROGRAM_UNAVAILABLE");
  }
  const cuts = buildCuts(shots, bpm, offsetS, audio?.onsets ?? null);
  const reportPath = join(out, "report.json");
  const report: AnalyzeReport = { version: 1, video, method: bounded.method, fps,
    durationS: shots.at(-1)?.endS ?? 0, bpm, beatOffsetS: bpm === null ? null : offsetS,
    shots, cuts, summary: buildSummary(shots, cuts, fps, bpm, audio?.onsets ?? null), audio,
    artifacts: { dir: out, report: reportPath, keyframes: join(out, "keyframes"),
      sheets: sheets.sheets, sheetIndex: sheets.sheetIndex, spectrogram }, warnings };
  AnalyzeReportSchema.parse(report);
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  return report;
}
