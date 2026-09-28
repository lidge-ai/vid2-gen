import { spawn } from "node:child_process";
import { cpus } from "node:os";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import type { AudioPlan, RenderPlan, SegmentPlan } from "../compile/ir.ts";
import { premaster } from "../audio/mix.ts";
import { twoPassLoudnorm } from "../audio/loudness.ts";
import type { Loudness } from "../audio/loudness.ts";
import { muxAudio } from "../audio/mux.ts";
import { probeFfmpeg } from "../probe/index.ts";
import { fpsString, hashJson, Vid2Error } from "../shared/index.ts";
import { cacheExists, saveSegmentCache, segmentCacheKey, segmentCachePath } from "./cache.ts";
import { selectHardwareEncoder } from "./encoders.ts";
import { ProgressParser } from "./progress.ts";
import type { RenderProgress } from "./progress.ts";
import { videoArgs } from "./profiles.ts";
import { verifyVideo } from "./verify.ts";
import { materializeStages } from "./stages.ts";
import type { StageResult } from "./stages.ts";
import { materializePretrim } from "./pretrim.ts";
import { StallWatch, stallLimitMs } from "./watchdog.ts";

export interface RenderEvent { stage: "segment" | "join" | "post" | "stage" | "pretrim"; id?: string; progress?: RenderProgress; message?: string }
export interface RenderOptions { jobs?: number; signal?: AbortSignal; noCache?: boolean; segments?: string[];
  hw?: boolean; out: string; logger?: (event: RenderEvent) => void }
export interface SegmentResult { id: string; cached: boolean; ms: number }
export interface AudioResult { master: Loudness; delivered: Loudness; durationDelta: number; normalization: string }
export interface RenderResult { output: string; seconds: number; segments: SegmentResult[]; warnings: string[]; manifest: string; audio?: AudioResult;
  stages?: StageResult[] }

function stageOptions(opts: RenderOptions): Parameters<typeof materializeStages>[2] {
  return { ...(opts.noCache ? { noCache: true } : {}), ...(opts.signal ? { signal: opts.signal } : {}),
    ...(opts.logger ? { logger: opts.logger } : {}) };
}

function graphFlag(plan: RenderPlan): string {
  return plan.tool.major > 7 || (plan.tool.major === 7 && plan.tool.minor >= 1) ? "-/filter_complex" : "-filter_complex_script";
}

async function graphArgs(plan: RenderPlan, id: string, graph: string): Promise<string[]> {
  const path = join(plan.workDir, `${id}.graph.txt`);
  await writeFile(path, graph);
  return [graphFlag(plan), path];
}

function runFfmpeg(plan: RenderPlan, args: string[], opts: RenderOptions, stage: RenderEvent["stage"], id?: string): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    if (opts.signal?.aborted) { reject(new Vid2Error("E_INTERRUPTED", "Render interrupted")); return; }
    const started = Date.now();
    const child = spawn(plan.tool.ffmpeg, ["-hide_banner", "-nostdin", "-y", "-nostats", "-progress", "pipe:2", ...args],
      { cwd: plan.workDir, signal: opts.signal, windowsHide: true });
    const parser = new ProgressParser((progress) => opts.logger?.({ stage, ...(id ? { id } : {}), progress }));
    const watch = new StallWatch(stallLimitMs(), () => child.kill("SIGKILL"));
    let tail = "";
    let pending = "";
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      tail = (tail + text).slice(-8192);
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        parser.line(line);
        if (line.startsWith("frame=")) watch.progress(Number(line.slice(6)));
      }
    });
    child.on("error", (cause) => {
      watch.stop();
      reject(new Vid2Error(opts.signal?.aborted ? "E_INTERRUPTED" : "E_RENDER", "ffmpeg could not start", { cause }));
    });
    child.on("close", (code) => {
      watch.stop();
      if (pending) parser.line(pending);
      if (code === 0) resolvePromise(Date.now() - started);
      else if (watch.fired) reject(new Vid2Error("E_RENDER", `ffmpeg ${stage} stalled`,
        { retryable: true, details: { id, stalled: true, frame: watch.frame ?? null, limitMs: stallLimitMs() } }));
      else reject(new Vid2Error(opts.signal?.aborted ? "E_INTERRUPTED" : "E_RENDER", `ffmpeg ${stage} failed`,
        { details: { id, code, stderrTail: tail.split(/\r?\n/).slice(-20).join("\n") } }));
    });
  });
}

/** One retry when the watchdog killed a stalled ffmpeg; every other failure propagates. */
async function runFfmpegOnceMore(plan: RenderPlan, args: string[], opts: RenderOptions, stage: RenderEvent["stage"], id?: string): Promise<number> {
  try { return await runFfmpeg(plan, args, opts, stage, id); } catch (error) {
    if (!(error instanceof Vid2Error) || error.details?.["stalled"] !== true) throw error;
    opts.logger?.({ stage, ...(id ? { id } : {}), message: "ffmpeg stalled; retrying once" });
    return runFfmpeg(plan, args, opts, stage, id);
  }
}

function outputArgs(plan: RenderPlan, intermediate: boolean, hardware: string[]): string[] {
  const base = hardware.length ? [...hardware, "-pix_fmt", "yuv420p"] : videoArgs(plan.output, plan.profile, intermediate);
  return [...base, "-r", fpsString(plan.output.fps), "-color_range", "tv",
    ...(intermediate || plan.output.container === "webm" ? [] : ["-movflags", "+faststart"])];
}

async function renderSegment(plan: RenderPlan, segment: SegmentPlan, opts: RenderOptions,
  hashes: Map<string, Promise<string>>): Promise<SegmentResult> {
  const output = join(plan.workDir, `segment-${segment.index}.mp4`);
  const key = await segmentCacheKey(segment, plan);
  const cached = segmentCachePath(key);
  const force = opts.segments?.includes(segment.id) || opts.segments?.includes(segment.sceneId);
  if (!opts.noCache && !force && await cacheExists(cached)) {
    await copyFile(cached, output);
    await verifyVideo(output, plan.tool.ffprobe, { width: segment.width, height: segment.height,
      frames: segment.renderFrames, pixFmt: "yuv420p", range: "tv" });
    return { id: segment.id, cached: true, ms: 0 };
  }
  for (const ass of segment.assFiles) {
    await mkdir(dirname(ass.path), { recursive: true });
    await mkdir(ass.fontsDir, { recursive: true });
    await writeFile(ass.path, ass.content);
  }
  const inputArgs: string[] = [];
  for (const input of segment.inputs) {
    if (!input.pretrim) { inputArgs.push(...input.args); continue; }
    const cut = await materializePretrim(input.pretrim, plan, segment.id,
      { hashes, ...(opts.noCache ? { noCache: true } : {}), ...(opts.signal ? { signal: opts.signal } : {}) });
    opts.logger?.({ stage: "pretrim", id: segment.id, message: cut.cached ? "cached" : "cut" });
    inputArgs.push("-i", cut.path);
  }
  const graph = await graphArgs(plan, `segment-${segment.index}`, segment.graph);
  const args = [...inputArgs, ...graph, "-map", `[${segment.outLabel}]`,
    "-an", "-frames:v", String(segment.renderFrames), ...outputArgs(plan, true, []), output];
  const ms = await runFfmpegOnceMore(plan, args, opts, "segment", segment.id);
  await verifyVideo(output, plan.tool.ffprobe, { width: segment.width, height: segment.height,
    frames: segment.renderFrames, pixFmt: "yuv420p", range: "tv" });
  if (!opts.noCache) await saveSegmentCache(output, cached);
  return { id: segment.id, cached: false, ms };
}

/** Render only selected segments through the normal verified, content-hash cache path. */
export async function renderSegments(plan: RenderPlan, ids: string[], opts: RenderOptions): Promise<{ id: string; path: string }[]> {
  await mkdir(plan.workDir, { recursive: true });
  const selected = ids.map((id) => {
    const segment = plan.segments.find((item) => item.id === id || item.sceneId === id);
    if (!segment) throw new Vid2Error("E_INPUT", `unknown segment: ${id}`);
    return segment;
  });
  const unique = [...new Map(selected.map((segment) => [segment.id, segment])).values()];
  await materializeStages(plan, [...new Set(unique.flatMap((segment) => segment.stageDeps ?? []))], stageOptions(opts));
  const hashes = new Map<string, Promise<string>>();
  await Promise.all(unique.map((segment) => renderSegment(plan, segment, opts, hashes)));
  return unique.map((segment) => ({ id: segment.id, path: join(plan.workDir, `segment-${segment.index}.mp4`) }));
}

async function segmentPool(plan: RenderPlan, opts: RenderOptions): Promise<SegmentResult[]> {
  const hashes = new Map<string, Promise<string>>();
  const count = Math.max(1, Math.min(plan.segments.length, Math.floor(opts.jobs ?? Math.max(1, cpus().length / 2))));
  const results: (SegmentResult | undefined)[] = Array.from({ length: plan.segments.length }, () => undefined);
  let next = 0;
  let failure: unknown;
  await Promise.all(Array.from({ length: count }, async () => {
    while (next < plan.segments.length && !failure) {
      const index = next++;
      try { results[index] = await renderSegment(plan, plan.segments[index]!, opts, hashes); }
      catch (error) { failure = error; }
    }
  }));
  if (failure) throw failure instanceof Error ? failure : new Vid2Error("E_RENDER", "segment render failed");
  return results.map((result) => {
    if (!result) throw new Vid2Error("E_INTERNAL", "segment pool did not return a result");
    return result;
  });
}

async function joinSegments(plan: RenderPlan, opts: RenderOptions): Promise<string> {
  const joined = join(plan.workDir, "joined.mp4");
  if (plan.segments.length === 1 || !plan.join.graph) {
    await copyFile(join(plan.workDir, `segment-${plan.segments[0]!.index}.mp4`), joined);
    return joined;
  }
  const graph = await graphArgs(plan, "join", plan.join.graph);
  const args = [...plan.segments.flatMap((segment) => ["-i", join(plan.workDir, `segment-${segment.index}.mp4`)]),
    ...graph, "-map", "[vjoin]", "-an", "-frames:v", String(plan.join.totalFrames), ...outputArgs(plan, true, []), joined];
  await runFfmpeg(plan, args, opts, "join");
  await verifyVideo(joined, plan.tool.ffprobe, { width: plan.output.width, height: plan.output.height,
    frames: plan.join.totalFrames, pixFmt: "yuv420p", range: "tv" });
  return joined;
}

function checkJoin(plan: RenderPlan): void {
  if (plan.join.steps.length !== plan.segments.length - 1) throw new Vid2Error("E_RENDER", "join step count does not match segments");
  let frames = plan.segments[0]!.frames;
  for (let i = 0; i < plan.join.steps.length; i++) {
    const step = plan.join.steps[i]!;
    if (step.kind === "xfade" && step.offsetFrames + step.frames > frames) {
      throw new Vid2Error("E_RENDER", "xfade extends past accumulated segment", { details: { step: i, frames } });
    }
    frames += plan.segments[i + 1]!.frames - step.frames;
  }
  if (frames !== plan.join.totalFrames || frames !== plan.totalFrames) {
    throw new Vid2Error("E_RENDER", "join frame total does not match render plan", { details: { frames, expected: plan.totalFrames } });
  }
}

async function finalEncode(plan: RenderPlan, joined: string, opts: RenderOptions, warnings: string[]): Promise<void> {
  let hardware: string[] = [];
  if (opts.hw) {
    if (plan.output.videoCodec === "h264" && plan.output.container !== "webm") {
      const info = await probeFfmpeg({ tools: { ffmpeg: plan.tool.ffmpeg, ffprobe: plan.tool.ffprobe } });
      const choice = selectHardwareEncoder(info, true);
      hardware = choice.args;
      if (choice.warning) warnings.push(choice.warning);
      if (choice.name) warnings.push(`${choice.name} settings are approximate and have not been quality-measured`);
    } else warnings.push("Hardware encode supports H.264 only; using software");
  }
  const graph = plan.post.graph ? await graphArgs(plan, "post", plan.post.graph) : [];
  const mapping = plan.post.graph ? ["-map", "[vpost]"] : ["-map", "0:v:0"];
  const args = ["-i", joined, ...plan.post.inputs.flatMap((input) => input.args), ...graph, ...mapping,
    "-an", "-frames:v", String(plan.totalFrames), ...outputArgs(plan, false, hardware), opts.out];
  await runFfmpeg(plan, args, opts, "post");
  await verifyVideo(opts.out, plan.tool.ffprobe, { width: plan.output.width, height: plan.output.height,
    frames: plan.totalFrames, pixFmt: plan.output.videoCodec === "prores" ? "yuv422p10le" : "yuv420p",
    range: "tv", ...(plan.output.container === "webm" ? {} : { faststart: true }) });
}

/** Audio stage (040): renders → premaster on the absolute timeline → two-pass loudnorm → mux with explicit duration. */
async function renderAudio(plan: RenderPlan, audio: AudioPlan, video: string, opts: RenderOptions, warnings: string[]): Promise<AudioResult> {
  opts.logger?.({ stage: "post", message: "mixing audio" });
  const pre = await premaster(audio, { ffmpeg: plan.tool.ffmpeg, ...(opts.signal ? { signal: opts.signal } : {}) });
  // AAC/Opus overshoot true peak by a few tenths of a dB; master 0.5 dB lower so the delivered file stays under the target.
  const mastered = await twoPassLoudnorm(pre, audio.master, { ...audio.target, TP: audio.target.TP - 0.5 }, plan.tool.ffmpeg);
  const seconds = (plan.totalFrames * plan.output.fps.den) / plan.output.fps.num;
  const muxed = await muxAudio({ video, audio: audio.master, out: opts.out, codec: audio.codec, seconds, ffmpeg: plan.tool.ffmpeg,
    ffprobe: plan.tool.ffprobe, targetTP: audio.target.TP });
  warnings.push(...muxed.warnings);
  await verifyVideo(opts.out, plan.tool.ffprobe, { width: plan.output.width, height: plan.output.height, frames: plan.totalFrames });
  return { master: mastered.loudness, delivered: muxed.loudness, durationDelta: muxed.durationDelta, normalization: mastered.normalizationType };
}

/** Render, verify and cache all segments, then join and encode the final video. */
export async function renderPlan(plan: RenderPlan, opts: RenderOptions): Promise<RenderResult> {
  if (!plan.segments.length) throw new Vid2Error("E_INPUT", "render plan has no segments");
  checkJoin(plan);
  opts = { ...opts, out: resolve(opts.out) };
  await mkdir(plan.workDir, { recursive: true });
  await mkdir(dirname(opts.out), { recursive: true });
  const started = Date.now();
  const stages = await materializeStages(plan, undefined, stageOptions(opts));
  const segments = await segmentPool(plan, opts);
  const joined = await joinSegments(plan, opts);
  const warnings: string[] = [];
  const videoOut = plan.audio ? join(plan.workDir, `video-only${extname(opts.out) || ".mp4"}`) : opts.out;
  await finalEncode(plan, joined, { ...opts, out: videoOut }, warnings);
  const audio = plan.audio ? await renderAudio(plan, plan.audio, videoOut, opts, warnings) : null;
  const result: RenderResult = { output: opts.out, seconds: (Date.now() - started) / 1000, segments, warnings,
    manifest: `${opts.out}.render.json`, ...(audio ? { audio } : {}), ...(stages.length ? { stages } : {}) };
  await writeFile(result.manifest, JSON.stringify({ planHash: hashJson(plan), timelineHash: plan.timelineHash,
    tool: plan.tool, profile: plan.profile, output: result.output, seconds: result.seconds, segments,
    warnings: [...new Set([...(plan.warnings ?? []), ...warnings])],
    ...(audio ? { audio: { ...audio, provenance: plan.audio?.provenance ?? [] } } : {}) }, null, 2) + "\n");
  return result;
}
