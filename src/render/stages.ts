/** Materialize a plan's stage clips (010): content-keyed cache, frame-by-frame JS render piped to FFV1, verification, atomic publish. */
import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { RenderPlan, StageRender } from "../compile/ir.ts";
import { cacheDir, hashFile, hashJson, Vid2Error } from "../shared/index.ts";
import { decodeImage } from "../stage/images.ts";
import { encodeFrames } from "../stage/encode.ts";
import { StageRenderer } from "../stage/render.ts";
import { imageKey, scaleBucket } from "../stage/sprites.ts";
import type { DecodedImage } from "../stage/sprites.ts";
import type { StageNode, StageSpec } from "../stage/types.ts";
import { STAGE_VERSION } from "../stage/types.ts";
import { verifyVideo } from "./verify.ts";

export interface StageEvent { stage: "stage"; id: string; message: string }
export interface StageOptions { noCache?: boolean; signal?: AbortSignal; logger?: (event: StageEvent) => void }
export interface StageResult { id: string; cached: boolean; ms: number }

function referencedFiles(spec: StageSpec): string[] {
  return [...new Set(spec.nodes.flatMap((n) => (n.kind === "text" ? [n.font] : n.kind === "image" ? [n.image] : [])))];
}

/** Cache key: canonical spec with file paths replaced by content hashes, renderer version and ffmpeg version. */
export async function stageCacheKey(render: StageRender, ffmpegVersion: string): Promise<string> {
  const files = referencedFiles(render.spec);
  const hashes = new Map(await Promise.all(files.map(async (f) => {
    try { return [f, await hashFile(f)] as const; }
    catch (cause) { throw new Vid2Error("E_NOT_FOUND", `stage input missing: ${f}`, { cause }); }
  })));
  const nodes = render.spec.nodes.map((n) => n.kind === "text" ? { ...n, font: hashes.get(n.font) }
    : n.kind === "image" ? { ...n, image: hashes.get(n.image) } : n);
  return hashJson({ spec: { ...render.spec, nodes }, version: STAGE_VERSION, ffmpegVersion });
}

function maxScale(node: StageNode, spec: StageSpec): number {
  const values = spec.tracks.filter((t) => t.node === node.key && ["scale", "scaleX", "scaleY"].includes(t.prop))
    .flatMap((t) => t.keys.map((k) => (typeof k.value === "number" ? Math.abs(k.value) : 1)));
  return Math.max(node.scale * Math.max(node.scaleX, node.scaleY), ...values.map((v) => v * node.scale));
}

async function loadImages(spec: StageSpec, ffmpeg: string): Promise<Map<string, DecodedImage>> {
  const largest = new Map<string, { node: Extract<StageNode, { kind: "image" }>; k: number }>();
  for (const node of spec.nodes) {
    if (node.kind !== "image") continue;
    const k = scaleBucket(maxScale(node, spec));
    const key = imageKey(node);
    if ((largest.get(key)?.k ?? 0) < k) largest.set(key, { node, k });
  }
  const images = new Map<string, DecodedImage>();
  for (const [key, { node, k }] of largest) images.set(key, await decodeImage(ffmpeg, node.image, node.width * k, node.height * k, node.fit));
  return images;
}

async function exists(path: string): Promise<boolean> {
  try { return (await stat(path)).size > 0; } catch { return false; }
}

const expected = (r: StageRender) => ({ width: r.width, height: r.height, frames: r.frames, pixFmt: "bgra" });

async function renderFresh(plan: RenderPlan, render: StageRender, cached: string, opts: StageOptions): Promise<void> {
  const images = await loadImages(render.spec, plan.tool.ffmpeg);
  const renderer = new StageRenderer(render.spec, images);
  const tmp = join(plan.workDir, `${render.id}.${process.pid}.tmp.mkv`);
  await encodeFrames({ ffmpeg: plan.tool.ffmpeg, out: tmp, width: render.width, height: render.height, fps: render.spec.fps,
    frames: render.frames, ...(opts.signal ? { signal: opts.signal } : {}) }, (n) => renderer.frame(n));
  await verifyVideo(tmp, plan.tool.ffprobe, expected(render));
  await rename(tmp, render.out);
  if (opts.noCache) return;
  await mkdir(cacheDir("stage"), { recursive: true });
  const staging = `${cached}.${process.pid}.tmp`;
  await copyFile(render.out, staging);
  await rename(staging, cached).catch(async () => { await copyFile(staging, cached); await rm(staging, { force: true }); });
}

export async function materializeStage(plan: RenderPlan, render: StageRender, opts: StageOptions = {}): Promise<StageResult> {
  const started = Date.now();
  const key = await stageCacheKey(render, plan.tool.version);
  const cached = join(cacheDir("stage"), `${key}.mkv`);
  await mkdir(plan.workDir, { recursive: true });
  if (!opts.noCache && await exists(cached)) {
    await copyFile(cached, render.out);
    await verifyVideo(render.out, plan.tool.ffprobe, expected(render));
    opts.logger?.({ stage: "stage", id: render.id, message: "cached" });
    return { id: render.id, cached: true, ms: 0 };
  }
  opts.logger?.({ stage: "stage", id: render.id, message: `rendering ${render.frames} frames` });
  await renderFresh(plan, render, cached, opts);
  return { id: render.id, cached: false, ms: Date.now() - started };
}

/** Materialize the given stage ids (all when ids is undefined), sequentially: rendering is CPU-bound on the main thread. */
export async function materializeStages(plan: RenderPlan, ids: string[] | undefined, opts: StageOptions = {}): Promise<StageResult[]> {
  const wanted = ids ? new Set(ids) : undefined;
  const results: StageResult[] = [];
  for (const render of plan.stageRenders ?? []) {
    if (wanted && !wanted.has(render.id)) continue;
    results.push(await materializeStage(plan, render, opts));
  }
  return results;
}
