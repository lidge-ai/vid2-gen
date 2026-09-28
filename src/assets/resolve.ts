/** Replace authored generate sources with cached local files without mutating the input timeline. */
import { resolve } from "node:path";
import { hashFile, Vid2Error } from "../shared/index.ts";
import type { Timeline } from "../timeline/index.ts";
import { lookupAsset, materializeRequest, normalizeAssetOptions, requestHash } from "./manifest.ts";
import { providerById } from "./registry.ts";
import { placeholderFiles, placeholderPng } from "./placeholders.ts";
import type { AssetKind, AssetProvider, GenerateRequest, ProviderContext, VideoOptions } from "./provider.ts";

export interface SourceAssetStatus {
  sourceId: string; provider: string; kind: AssetKind; status: "cached" | "generated" | "missing" | "placeholder";
  path?: string; requestHash: string;
}
export interface MaterializeOptions {
  /** placeholders: like status, but misses (and missing files) become stripe PNG image sources (060). */
  mode: "generate" | "require" | "status" | "placeholders";
  ctx?: ProviderContext;
  providers?: (id: string) => AssetProvider;
}
/** generatedVideos: generated video source id → clip seconds (manifest durationS on a hit, else probed; null if unknown). */
export interface MaterializeResult { timeline: Timeline; assets: SourceAssetStatus[]; warnings: string[];
  generatedVideos?: Record<string, { durationS: number | null }> }

async function requestFor(source: Extract<Timeline["sources"][string], { type: "generate" }>, baseDir: string,
  mode: MaterializeOptions["mode"]): Promise<{ req: GenerateRequest; hash: string; seedMissing: boolean }> {
  const kind = source.kind as AssetKind;
  if (kind !== "image" && kind !== "video") throw new Vid2Error("E_INPUT", "audio generation belongs in timeline.audio", {
    fix: "Use timeline.audio and vid2 audio generate." });
  const options = normalizeAssetOptions(kind, source.options);
  const authoredSeed = source.options["seedImage"];
  let seedImageSha: string | undefined;
  let seedMissing = false;
  if (typeof authoredSeed === "string") {
    const seedPath = resolve(baseDir, authoredSeed);
    try { seedImageSha = await hashFile(seedPath); }
    catch (cause) {
      if (mode !== "status") throw new Vid2Error("E_INPUT", `seed image is missing: ${authoredSeed}`, {
        cause, fix: "Check the seedImage path relative to the timeline." });
      seedImageSha = "missing"; seedMissing = true;
    }
    if (kind === "video") (options as VideoOptions).seedImage = seedPath;
  }
  const prompt = source.provider === "file" ? resolve(baseDir, source.prompt) : source.prompt;
  const req: GenerateRequest = { kind, prompt, options, ...(seedImageSha ? { seedImageSha } : {}) };
  const hash = requestHash({ provider: source.provider, kind, prompt, options: options as unknown as Record<string, unknown>,
    ...(seedImageSha ? { seedImageSha } : {}) });
  return { req, hash, seedMissing };
}

function cachedSource(kind: AssetKind, path: string): Timeline["sources"][string] {
  return kind === "image" ? { type: "image", path } : { type: "video", path, muted: false };
}

export async function materializeSources(timeline: Timeline, baseDir: string, opts: MaterializeOptions): Promise<MaterializeResult> {
  const sources: Timeline["sources"] = { ...timeline.sources };
  const assets: SourceAssetStatus[] = [];
  for (const [sourceId, source] of Object.entries(timeline.sources)) {
    if (source.type !== "generate") continue;
    const { req, hash, seedMissing } = await requestFor(source, baseDir, opts.mode === "placeholders" ? "status" : opts.mode);
    const hit = seedMissing ? undefined : lookupAsset(hash);
    if (hit) {
      sources[sourceId] = cachedSource(req.kind, hit.path);
      assets.push({ sourceId, provider: source.provider, kind: req.kind, status: "cached", path: hit.path, requestHash: hash });
      continue;
    }
    if (opts.mode === "placeholders") {
      const path = placeholderPng(sourceId, timeline);
      sources[sourceId] = { type: "image", path };
      assets.push({ sourceId, provider: source.provider, kind: req.kind, status: "placeholder", path, requestHash: hash });
      continue;
    }
    if (opts.mode === "status") {
      assets.push({ sourceId, provider: source.provider, kind: req.kind, status: "missing", requestHash: hash });
      continue;
    }
    if (opts.mode === "require") throw new Vid2Error("E_INPUT", `generated asset ${sourceId} is not cached`, {
      details: { sourceId, requestHash: hash }, fix: "run vid2 assets resolve <timeline> or pass --generate" });
    const provider = opts.providers ? opts.providers(source.provider) : providerById(source.provider, opts.ctx);
    const generated = await materializeRequest(provider, req, hash);
    sources[sourceId] = cachedSource(req.kind, generated.asset.path);
    assets.push({ sourceId, provider: source.provider, kind: req.kind, status: generated.status, path: generated.asset.path, requestHash: hash });
  }
  const materialized = { ...timeline, sources };
  const warnings = assets.filter((a) => a.status === "placeholder").map((a) => `W_PLACEHOLDER ${a.sourceId}`);
  if (opts.mode !== "placeholders") return { timeline: materialized, assets, warnings };
  const files = placeholderFiles(materialized, baseDir);
  return { timeline: files.timeline, assets, warnings: [...warnings, ...files.warnings] };
}
