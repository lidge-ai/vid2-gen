import { spawn } from "node:child_process";
import { cpus } from "node:os";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { RenderPlan, SegmentPlan } from "../compile/ir.ts";
import { probeFfmpeg } from "../probe/index.ts";
import { fpsString, hashJson, Vid2Error } from "../shared/index.ts";
import { cacheExists, saveSegmentCache, segmentCacheKey, segmentCachePath } from "./cache.ts";
import { selectHardwareEncoder } from "./encoders.ts";
import { ProgressParser } from "./progress.ts";
import type { RenderProgress } from "./progress.ts";
import { videoArgs } from "./profiles.ts";
import { verifyVideo } from "./verify.ts";

export interface RenderEvent { stage: "segment" | "join" | "post"; id?: string; progress?: RenderProgress; message?: string }
export interface RenderOptions { jobs?: number; signal?: AbortSignal; noCache?: boolean; segments?: string[];
  hw?: boolean; out: string; logger?: (event: RenderEvent) => void }
export interface SegmentResult { id: string; cached: boolean; ms: number }
export interface RenderResult { output: string; seconds: number; segments: SegmentResult[]; warnings: string[]; manifest: string }

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
    let tail = "";
    let pending = "";
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      tail = (tail + text).slice(-8192);
      pending += text;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) parser.line(line);
    });
    child.on("error", (cause) => reject(new Vid2Error(opts.signal?.aborted ? "E_INTERRUPTED" : "E_RENDER", "ffmpeg could not start", { cause })));
    child.on("close", (code) => {
      if (pending) parser.line(pending);
      if (code === 0) resolvePromise(Date.now() - started);
      else reject(new Vid2Error(opts.signal?.aborted ? "E_INTERRUPTED" : "E_RENDER", `ffmpeg ${stage} failed`,
        { details: { id, code, stderrTail: tail.split(/\r?\n/).slice(-20).join("\n") } }));
    });
  });
}

function outputArgs(plan: RenderPlan, intermediate: boolean, hardware: string[]): string[] {
  const base = hardware.length ? [...hardware, "-pix_fmt", "yuv420p"] : videoArgs(plan.output, plan.profile, intermediate);
  return [...base, "-r", fpsString(plan.output.fps), "-color_range", "tv",
    ...(intermediate || plan.output.container === "webm" ? [] : ["-movflags", "+faststart"])];
}

async function renderSegment(plan: RenderPlan, segment: SegmentPlan, opts: RenderOptions): Promise<SegmentResult> {
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
  const graph = await graphArgs(plan, `segment-${segment.index}`, segment.graph);
  const args = [...segment.inputs.flatMap((input) => input.args), ...graph, "-map", `[${segment.outLabel}]`,
    "-an", "-frames:v", String(segment.renderFrames), ...outputArgs(plan, true, []), output];
  const ms = await runFfmpeg(plan, args, opts, "segment", segment.id);
  await verifyVideo(output, plan.tool.ffprobe, { width: segment.width, height: segment.height,
    frames: segment.renderFrames, pixFmt: "yuv420p", range: "tv" });
  if (!opts.noCache) await saveSegmentCache(output, cached);
  return { id: segment.id, cached: false, ms };
}

async function segmentPool(plan: RenderPlan, opts: RenderOptions): Promise<SegmentResult[]> {
  const count = Math.max(1, Math.min(plan.segments.length, Math.floor(opts.jobs ?? Math.max(1, cpus().length / 2))));
  const results: (SegmentResult | undefined)[] = Array.from({ length: plan.segments.length }, () => undefined);
  let next = 0;
  let failure: unknown;
  await Promise.all(Array.from({ length: count }, async () => {
    while (next < plan.segments.length && !failure) {
      const index = next++;
      try { results[index] = await renderSegment(plan, plan.segments[index]!, opts); }
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

/** Render, verify and cache all segments, then join and encode the final video. */
export async function renderPlan(plan: RenderPlan, opts: RenderOptions): Promise<RenderResult> {
  if (!plan.segments.length) throw new Vid2Error("E_INPUT", "render plan has no segments");
  if (plan.audio) throw new Vid2Error("E_CAPABILITY", "audio plans are not supported until wp5");
  checkJoin(plan);
  opts = { ...opts, out: resolve(opts.out) };
  await mkdir(plan.workDir, { recursive: true });
  await mkdir(dirname(opts.out), { recursive: true });
  const started = Date.now();
  const segments = await segmentPool(plan, opts);
  const joined = await joinSegments(plan, opts);
  const warnings: string[] = [];
  await finalEncode(plan, joined, opts, warnings);
  const result: RenderResult = { output: opts.out, seconds: (Date.now() - started) / 1000, segments, warnings,
    manifest: `${opts.out}.render.json` };
  await writeFile(result.manifest, JSON.stringify({ planHash: hashJson(plan), timelineHash: plan.timelineHash,
    tool: plan.tool, profile: plan.profile, output: result.output, seconds: result.seconds, segments, warnings }, null, 2) + "\n");
  return result;
}
