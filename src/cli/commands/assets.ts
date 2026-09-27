/** vid2 assets: materialize a timeline, generate one asset, or inspect provider readiness. */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { hashFile, isVid2Error, Vid2Error } from "../../shared/index.ts";
import { lookupAsset, materializeRequest, requestHash } from "../../assets/manifest.ts";
import { providerById, ASSET_PROVIDER_IDS } from "../../assets/registry.ts";
import { materializeSources } from "../../assets/resolve.ts";
import type { SourceAssetStatus } from "../../assets/resolve.ts";
import type { AssetKind, VideoOptions } from "../../assets/provider.ts";
import type { CommandResult } from "../output.ts";
import type { CommandSpec } from "../registry.ts";
import { loadTimeline } from "./timeline-file.ts";

type Values = Record<string, unknown>;
const stringValue = (values: Values, key: string): string | undefined =>
  typeof values[key] === "string" ? values[key] : undefined;

function kindOf(value: string | undefined): AssetKind {
  if (value === "image" || value === "video") return value;
  throw new Vid2Error("E_INPUT", "asset kind must be image or video");
}

async function resolveTimelineAssets(file: string | undefined, cwd: string): Promise<CommandResult> {
  const { timeline, path } = await loadTimeline(file, cwd);
  const assets: SourceAssetStatus[] = [];
  const failed: { sourceId: string; provider: string; kind: string; code: string; message: string }[] = [];
  let firstError: Vid2Error | undefined;
  for (const [sourceId, source] of Object.entries(timeline.sources)) {
    if (source.type !== "generate") continue;
    try {
      const one = await materializeSources({ ...timeline, sources: { [sourceId]: source } }, dirname(path), { mode: "generate" });
      assets.push(...one.assets);
    } catch (error) {
      const typed = isVid2Error(error) ? error : new Vid2Error("E_PROVIDER", error instanceof Error ? error.message : "asset generation failed");
      firstError ??= typed;
      failed.push({ sourceId, provider: source.provider, kind: source.kind, code: typed.code, message: typed.message });
    }
  }
  const reused = assets.filter((item) => item.status === "cached").length;
  const generated = assets.filter((item) => item.status === "generated").length;
  if (failed.length) throw new Vid2Error(firstError?.code ?? "E_PROVIDER", "some assets could not be resolved", {
    details: { assets, reused, generated, failed }, ...(firstError?.fix ? { fix: firstError.fix } : {}) });
  return { command: "assets resolve", data: { assets, reused, generated, failed },
    artifacts: assets.flatMap((item) => item.path ? [item.path] : []) };
}

async function generateOne(args: string[], values: Values, cwd: string): Promise<CommandResult> {
  const [id, kindArg, promptArg] = args;
  if (!id || !kindArg || !promptArg) throw new Vid2Error("E_INPUT", "assets gen needs provider, kind and prompt");
  const kind = kindOf(kindArg);
  const provider = providerById(id);
  const prompt = id === "file" ? resolvePath(cwd, promptArg) : promptArg;
  const raw: Record<string, unknown> = {};
  for (const key of ["size", "quality", "background", "model", "resolution"]) {
    const value = stringValue(values, key);
    if (value !== undefined) raw[key] = value;
  }
  const duration = stringValue(values, "duration");
  if (duration !== undefined) {
    const seconds = Number(duration);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Vid2Error("E_INPUT", "--duration must be positive seconds");
    raw["durationS"] = seconds;
  }
  const aspectRatio = stringValue(values, "aspect-ratio");
  if (aspectRatio !== undefined) raw["aspectRatio"] = aspectRatio;
  const seedArg = stringValue(values, "seed-image");
  if (seedArg && kind !== "video") throw new Vid2Error("E_INPUT", "--seed-image requires video kind");
  const seedPath = seedArg ? resolvePath(cwd, seedArg) : undefined;
  if (seedPath) raw["seedImage"] = seedPath;
  const options = provider.normalize(kind, raw);
  if (seedPath) (options as VideoOptions).seedImage = seedPath;
  const seedImageSha = seedPath ? await hashFile(seedPath) : undefined;
  const hash = requestHash({ provider: id, kind, prompt, options: options as unknown as Record<string, unknown>,
    ...(seedImageSha ? { seedImageSha } : {}) });
  const cached = lookupAsset(hash);
  const result = cached ? { asset: cached, status: "cached" as const } :
    await materializeRequest(provider, { kind, prompt, options, ...(seedImageSha ? { seedImageSha } : {}) }, hash);
  const requested = stringValue(values, "out");
  const output = requested ? resolvePath(cwd, requested) : result.asset.path;
  if (output !== result.asset.path) { await mkdir(dirname(output), { recursive: true }); await copyFile(result.asset.path, output); }
  return { command: "assets gen", data: { provider: id, kind, status: result.status, path: output,
    requestHash: hash, width: result.asset.width, height: result.asset.height, durationS: result.asset.durationS }, artifacts: [output] };
}

async function providers(): Promise<CommandResult> {
  const capabilities: Record<string, unknown> = {};
  for (const id of ASSET_PROVIDER_IDS) capabilities[id] = await providerById(id).capabilities();
  return { command: "assets providers", data: capabilities };
}

export const assets: CommandSpec = {
  name: "assets",
  summary: "Generate and cache image/video assets from local files or ima2",
  usage: "vid2 assets <resolve <timeline> | gen <provider> <image|video> <prompt> [options] | providers> [--json]",
  options: {
    size: { type: "string", description: "image size WxH" }, quality: { type: "string", description: "image quality" },
    background: { type: "string", description: "opaque, transparent or chroma-green" },
    model: { type: "string", description: "provider model" }, duration: { type: "string", description: "video seconds" },
    resolution: { type: "string", description: "480p, 720p or 1080p" },
    "aspect-ratio": { type: "string", description: "video aspect ratio" },
    "seed-image": { type: "string", description: "video seed image path" },
    out: { type: "string", short: "o", description: "output file path" },
  },
  async run({ args, values, cwd }) {
    const [sub, ...rest] = args;
    if (sub === "resolve") {
      if (rest.length !== 1) throw new Vid2Error("E_INPUT", "assets resolve needs one timeline path");
      return resolveTimelineAssets(rest[0], cwd);
    }
    if (sub === "gen") {
      if (rest.length !== 3) throw new Vid2Error("E_INPUT", "assets gen needs provider, kind and prompt");
      return generateOne(rest, values, cwd);
    }
    if (sub === "providers" && rest.length === 0) return providers();
    throw new Vid2Error("E_INPUT", "assets needs resolve, gen or providers");
  },
};
