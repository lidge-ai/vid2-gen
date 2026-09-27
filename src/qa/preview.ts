/** Bounded final-composition stills from cached scene segments. */
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { RenderPlan, SegmentPlan } from "../compile/ir.ts";
import { num, quoteExpr } from "../compile/escape.ts";
import { transitionChain } from "../compile/transitions.ts";
import { renderSegments } from "../render/runner.ts";
import { videoArgs } from "../render/profiles.ts";
import { framesToSeconds, fpsString, runChecked, Vid2Error } from "../shared/index.ts";
import type { PreviewFrame } from "./report.ts";

interface WindowPlan { first: number; second?: number; startFrame: number; scenes: string[] }

function sceneStarts(plan: RenderPlan): number[] {
  const starts = [0];
  for (let i = 1; i < plan.segments.length; i++) {
    const previous = plan.segments[i - 1]!;
    starts.push(starts[i - 1]! + previous.frames - (plan.join.steps[i - 1]?.frames ?? 0));
  }
  return starts;
}

function windowAt(plan: RenderPlan, frame: number, segmentOnly: boolean): WindowPlan {
  const starts = sceneStarts(plan);
  for (let i = 0; i < plan.segments.length - 1; i++) {
    const step = plan.join.steps[i];
    const nextStart = starts[i + 1]!;
    if (step?.kind === "xfade" && frame >= nextStart && frame < starts[i]! + plan.segments[i]!.frames) {
      if (segmentOnly) return { first: i, startFrame: starts[i]!, scenes: [plan.segments[i]!.sceneId] };
      return { first: i, second: i + 1, startFrame: starts[i]!, scenes: [plan.segments[i]!.sceneId, plan.segments[i + 1]!.sceneId] };
    }
  }
  for (let i = plan.segments.length - 1; i >= 0; i--) {
    const segment = plan.segments[i]!;
    if (frame >= starts[i]! && frame < starts[i]! + segment.frames) {
      return { first: i, startFrame: starts[i]!, scenes: [segment.sceneId] };
    }
  }
  throw new Vid2Error("E_INPUT", `preview frame ${frame} is outside the timeline`);
}

function sourceGraph(plan: RenderPlan, window: WindowPlan, segmentOnly: boolean): string[] {
  if (window.second === undefined || segmentOnly) return ["[0:v]settb=AVTB,setpts=PTS-STARTPTS[pwindow]"];
  const first = plan.segments[window.first]!;
  const step = plan.join.steps[window.first]!;
  const rate = fpsString(plan.output.fps);
  const normalize = (index: number, label: string) =>
    `[${index}:v]fps=${rate},settb=AVTB,setpts=PTS-STARTPTS,format=yuv420p,setsar=1,scale=out_range=tv[${label}]`;
  const seconds = (frames: number) => frames * plan.output.fps.den / plan.output.fps.num;
  return [normalize(0, "pa"), normalize(1, "pb"),
    `[pa]trim=end_frame=${num(first.frames)},setpts=PTS-STARTPTS[pat]`,
    `[pb]trim=end_frame=${num(plan.segments[window.second]!.frames)},setpts=PTS-STARTPTS[pbt]`,
    ...transitionChain(step.spec ?? { type: step.transition ?? "fade", width: plan.output.width, height: plan.output.height },
      seconds(step.frames), seconds(first.frames - step.frames), { a: "pat", b: "pbt", out: "pwindow" })];
}

function postGraph(plan: RenderPlan, extraSegmentInputs: number): string {
  if (!plan.post.graph) return "";
  return plan.post.graph.replace(/\[(\d+):([vas])(?::(\d+))?\]/g, (_full, raw: string, kind: string, stream?: string) => {
    const index = Number(raw);
    if (index === 0 && kind === "v") return "[pabs]";
    return `[${index + extraSegmentInputs}:${kind}${stream === undefined ? "" : `:${stream}`}]`;
  });
}

function postWindowGraph(plan: RenderPlan, window: WindowPlan): string {
  const fps = plan.output.fps;
  const chains = [`[0:v]setpts=PTS+(${num(window.startFrame)}*${num(fps.den)}/${num(fps.num)})/TB[pabs]`];
  if (plan.post.graph) chains.push(postGraph(plan, 0));
  // Filters see absolute t; reset only after they finish so the bounded MP4 starts at PTS zero.
  chains.push(`[${plan.post.graph ? "vpost" : "pabs"}]setpts=PTS-STARTPTS[vout]`);
  return chains.join(";\n");
}

async function graphFile(plan: RenderPlan, name: string, graph: string): Promise<string> {
  const path = join(plan.workDir, `${name}.graph.txt`);
  await writeFile(path, graph);
  return path;
}

function graphFlag(plan: RenderPlan): string {
  return plan.tool.major > 7 || plan.tool.major === 7 && plan.tool.minor >= 1 ? "-/filter_complex" : "-filter_complex_script";
}

async function encodeWindow(plan: RenderPlan, files: string[], window: WindowPlan, frame: number, out: string): Promise<void> {
  const count = frame - window.startFrame + 1;
  const graph = window.second === undefined ? [] : [graphFlag(plan), await graphFile(plan, `preview-join-${frame}`, sourceGraph(plan, window, false).join(";\n"))];
  const mapping = window.second === undefined ? ["-map", "0:v:0"] : ["-map", "[pwindow]"];
  await runChecked(plan.tool.ffmpeg, ["-hide_banner", "-y", ...files.flatMap((file) => ["-i", file]),
    ...graph, ...mapping, "-an", "-frames:v", String(count), ...videoArgs(plan.output, plan.profile, true),
    "-r", fpsString(plan.output.fps), "-color_range", "tv", out], { cwd: plan.workDir, timeoutMs: 120_000 });
}

async function encodePost(plan: RenderPlan, window: WindowPlan, frame: number, input: string, out: string): Promise<void> {
  const graph = await graphFile(plan, `preview-post-${frame}`, postWindowGraph(plan, window));
  const faststart = plan.output.container === "webm" ? [] : ["-movflags", "+faststart"];
  await runChecked(plan.tool.ffmpeg, ["-hide_banner", "-y", "-i", input,
    ...plan.post.inputs.flatMap((item) => item.args), graphFlag(plan), graph, "-map", "[vout]",
    "-an", "-frames:v", String(frame - window.startFrame + 1), ...videoArgs(plan.output, plan.profile),
    "-r", fpsString(plan.output.fps), "-color_range", "tv", ...faststart, out], { cwd: plan.workDir, timeoutMs: 120_000 });
}

async function extractFrame(plan: RenderPlan, input: string, frame: number, out: string): Promise<void> {
  const filter = `select=${quoteExpr(`eq(n,${num(frame)})`)}`;
  await runChecked(plan.tool.ffmpeg, ["-hide_banner", "-y", "-i", input, "-vf", filter,
    "-frames:v", "1", "-c:v", "png", "-f", "image2", "-update", "1", out],
  { cwd: plan.workDir, timeoutMs: 120_000 });
}

async function extract(plan: RenderPlan, files: string[], window: WindowPlan, frame: number,
  out: string, segmentOnly: boolean): Promise<void> {
  const local = frame - window.startFrame;
  if (segmentOnly) { await extractFrame(plan, files[0]!, local, out); return; }
  const joined = join(plan.workDir, `preview-window-${frame}.mp4`);
  const post = join(plan.workDir, `preview-final-${frame}.${plan.output.container}`);
  try {
    await encodeWindow(plan, files, window, frame, joined);
    await encodePost(plan, window, frame, joined, post);
    await extractFrame(plan, post, local, out);
  } finally { await Promise.all([unlink(joined).catch(() => {}), unlink(post).catch(() => {})]); }
}

export async function preview(plan: RenderPlan, frames: number[], opts: { out: string; segmentOnly?: boolean }): Promise<PreviewFrame[]> {
  if (!plan.segments.length) throw new Vid2Error("E_INPUT", "preview plan has no segments");
  const out = resolve(opts.out);
  await mkdir(out, { recursive: true });
  await mkdir(plan.workDir, { recursive: true });
  const windows = frames.map((frame) => {
    if (!Number.isInteger(frame) || frame < 0 || frame >= plan.totalFrames) throw new Vid2Error("E_INPUT", `invalid preview frame: ${frame}`);
    return windowAt(plan, frame, opts.segmentOnly === true);
  });
  const ids = [...new Set(windows.flatMap((window) => [plan.segments[window.first]!.id,
    ...(window.second === undefined ? [] : [plan.segments[window.second]!.id])]))];
  const rendered = new Map((await renderSegments(plan, ids, { out })).map((item) => [item.id, item.path]));
  const result: PreviewFrame[] = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!; const window = windows[i]!;
    const selected: SegmentPlan[] = [plan.segments[window.first]!, ...(window.second === undefined ? [] : [plan.segments[window.second]!])];
    const files = selected.map((segment) => rendered.get(segment.id)!);
    const path = join(out, `frame-${String(frame).padStart(6, "0")}.png`);
    await extract(plan, files, window, frame, path, opts.segmentOnly === true);
    result.push({ at: String(frame), frame, seconds: framesToSeconds(frame, plan.output.fps), scenes: window.scenes,
      window: { startFrame: window.startFrame, endFrame: frame }, composition: opts.segmentOnly ? "segment" : "final", path });
  }
  await writeFile(join(out, "preview.json"), JSON.stringify({ version: 1, frames: result }, null, 2) + "\n");
  return result;
}
