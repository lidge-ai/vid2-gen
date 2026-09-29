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
import type { CommandOption, CommandSpec } from "../registry.ts";
import { parentCommand } from "../tree.ts";
import { loadTimeline } from "./timeline-file.ts";

type Values = Record<string, unknown>;
const stringValue = (values: Values, key: string): string | undefined =>
  typeof values[key] === "string" ? values[key] : undefined;

function kindOf(value: string | undefined): AssetKind {
  if (value === "image" || value === "video") return value;
  throw new Vid2Error("E_INPUT", "asset kind must be image or video");
}

/** Hash an input image after the guard ran (041 V-11); a missing file is E_INPUT naming the flag. */
async function hashInput(path: string, authored: string, flag: string): Promise<string> {
  try { return await hashFile(path); }
  catch (cause) { throw new Vid2Error("E_INPUT", `input image is missing: ${authored}`, { cause, details: { path: flag } }); }
}

/** Repeatable --ref paths resolved against cwd, in order. */
function referenceArgs(values: Values, kind: AssetKind, cwd: string): { authored: string[]; paths: string[] } | undefined {
  const refs = values["ref"];
  if (refs === undefined) return undefined;
  if (!Array.isArray(refs) || refs.some((value: unknown) => typeof value !== "string") || kind !== "video")
    throw new Vid2Error("E_INPUT", "--ref requires video kind and a path", { details: { path: "--ref" } });
  const authored = refs as string[];
  return { authored, paths: authored.map(path => resolvePath(cwd, path)) };
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
  const refs = referenceArgs(values, kind, cwd);
  const referenceImages = refs?.paths;
  const seedPath = seedArg ? resolvePath(cwd, seedArg) : undefined;
  if (seedPath) raw["seedImage"] = seedPath;
  if (referenceImages) raw["referenceImages"] = referenceImages;
  const options = provider.normalize(kind, raw);
  if (seedPath) (options as VideoOptions).seedImage = seedPath;
  if (referenceImages) (options as VideoOptions).referenceImages = referenceImages;
  const seedImageSha = seedPath && seedArg ? await hashInput(seedPath, seedArg, "--seed-image") : undefined;
  const referenceImagesSha = refs ? await Promise.all(refs.paths.map((path, index) =>
    hashInput(path, refs.authored[index] ?? path, `--ref.${index}`))) : undefined;
  const hash = requestHash({ provider: id, kind, prompt, options: options as unknown as Record<string, unknown>,
    ...(seedImageSha ? { seedImageSha } : {}), ...(referenceImagesSha ? { referenceImagesSha } : {}) });
  const cached = lookupAsset(hash);
  const result = cached ? { asset: cached, status: "cached" as const } :
    await materializeRequest(provider, { kind, prompt, options, ...(seedImageSha ? { seedImageSha } : {}),
      ...(referenceImagesSha ? { referenceImagesSha } : {}) }, hash);
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

const ASSETS_GEN_OPTIONS: Record<string, CommandOption> = {
  size: { type: "string", value: "<WxH>", description: "Image size, e.g. 1536x1024" },
  quality: { type: "string", value: "<quality>", description: "Image quality, passed to the provider" },
  background: { type: "string", value: "<opaque|transparent|chroma-green>", description: "Image background" },
  model: { type: "string", value: "<id>", description: "Provider model id" },
  duration: { type: "string", value: "<seconds>", description: "Video length, whole seconds 1-15" },
  resolution: { type: "string", value: "<480p|720p|1080p>", description: "Video resolution" },
  "aspect-ratio": { type: "string", value: "<ratio>", description: "Video aspect ratio: 16:9, 9:16, 1:1, 4:3, 3:4, 3:2, 2:3 or auto" },
  "seed-image": { type: "string", value: "<file>", description: "Video: first-frame image (not with --ref)" },
  ref: { type: "string", multiple: true, value: "<file>", description: "Video: reference image, in order" },
  out: { type: "string", short: "o", value: "<file>", description: "Also copy the cached asset to this path" },
};

const resolveSpec: CommandSpec = {
  name: "resolve", summary: "Generate or reuse every generated source a timeline declares",
  usage: "vid2 assets resolve <timeline.json> [--json]", options: {},
  description: "Cached results are reused by request hash; only uncached sources call a provider.",
  examples: ["vid2 assets resolve timeline.json --json"],
  run({ args, cwd }) {
    if (args.length !== 1) return Promise.reject(new Vid2Error("E_INPUT", "assets resolve needs one timeline path"));
    return resolveTimelineAssets(args[0], cwd);
  },
};

const genSpec: CommandSpec = {
  name: "gen", summary: "Generate one image or video asset and cache it",
  usage: "vid2 assets gen <provider> <image|video> <prompt> [options] [--json]",
  description: `Providers: ${ASSET_PROVIDER_IDS.join(", ")}. With provider "file" the prompt is a local path to import.`,
  options: ASSETS_GEN_OPTIONS,
  examples: [
    'vid2 assets gen ima2 image "a paper city at dawn" --size 1536x1024 -o media/hero.png',
    'vid2 assets gen ima2 video "slow push-in on the city" --duration 5 --seed-image media/hero.png',
  ],
  run({ args, values, cwd }) {
    if (args.length !== 3) return Promise.reject(new Vid2Error("E_INPUT", "assets gen needs provider, kind and prompt"));
    return generateOne(args, values, cwd);
  },
};

const providersSpec: CommandSpec = {
  name: "providers", summary: "Show asset provider readiness (ima2 and local files)",
  usage: "vid2 assets providers [--json]", options: {}, examples: ["vid2 assets providers --json"],
  run({ args }) {
    if (args.length) return Promise.reject(new Vid2Error("E_INPUT", "assets providers takes no arguments"));
    return providers();
  },
};

export const assets = parentCommand({
  name: "assets", group: "media",
  summary: "Generate and cache image/video assets from local files or ima2",
  usage: "vid2 assets <resolve|gen|providers> [options] [--json]",
  description: "vid2 render never calls a provider by itself; resolve or gen assets first, or render with --placeholders.",
  options: {},
  subcommands: [resolveSpec, genSpec, providersSpec],
  examples: ["vid2 assets resolve timeline.json", "vid2 assets providers"],
});
