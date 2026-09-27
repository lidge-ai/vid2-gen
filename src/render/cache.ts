import { copyFile, rename, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { cacheDir, hashFile, hashJson, Vid2Error } from "../shared/index.ts";
import type { RenderPlan, SegmentPlan } from "../compile/ir.ts";
import { escapePath } from "../compile/escape.ts";

async function hashOrMissing(path: string): Promise<string> {
  try { return await hashFile(path); }
  catch (cause) { throw new Vid2Error("E_NOT_FOUND", `Render input missing: ${path}`, { cause }); }
}

/** Cache key includes media, fonts, graph and the ffmpeg implementation version. */
export async function segmentCacheKey(segment: SegmentPlan, plan: RenderPlan): Promise<string> {
  const escapedWork = escapePath(plan.workDir);
  const normalize = (value: string) => value.replaceAll(escapedWork, "<workDir>").replaceAll(plan.workDir, "<workDir>");
  const paths = [...segment.inputs.map((input) => input.path).filter((value): value is string => !!value), ...segment.fontFiles];
  const inputHashes = await Promise.all(paths.map(async (path) => [normalize(path), await hashOrMissing(path)]));
  const { hash: _hash, ...fields } = segment;
  const stableSegment = { ...fields, graph: normalize(segment.graph),
    inputs: segment.inputs.map((input) => ({ ...input, args: input.args.map(normalize),
      ...(input.path ? { path: normalize(input.path) } : {}) })),
    fontFiles: segment.fontFiles.map(normalize), assFiles: segment.assFiles.map((ass) => ({ content: ass.content })) };
  void _hash;
  return hashJson({ segment: stableSegment,
    inputHashes, profile: plan.profile, ffmpegVersion: plan.tool.version, effectVersions: 1 });
}

export function segmentCachePath(key: string): string { return join(cacheDir("segments"), `${key}.mp4`); }

export async function cacheExists(path: string): Promise<boolean> {
  try { return (await stat(path)).size > 0; } catch { return false; }
}

export async function saveSegmentCache(output: string, destination: string): Promise<void> {
  const tmp = `${destination}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await copyFile(output, tmp);
  try { await rename(tmp, destination); }
  catch { await copyFile(tmp, destination); await unlink(tmp); }
}
