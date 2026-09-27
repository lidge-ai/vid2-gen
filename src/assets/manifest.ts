/** Content-keyed generated assets. The manifest is atomic; stale file entries are cache misses. */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, rename, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { cacheDir, hashFile, hashJson, Vid2Error } from "../shared/index.ts";
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "./provider.ts";
import type { AssetKind, AssetProvider, GenerateRequest, ImageOptions, MaterializedAsset, VideoOptions } from "./provider.ts";

export interface AssetRequestKey { provider: string; kind: AssetKind; prompt: string; options: Record<string, unknown>; seedImageSha?: string }
export type AssetManifest = Record<string, MaterializedAsset>;

export function normalizeAssetOptions(kind: AssetKind, options: Record<string, unknown>): ImageOptions | VideoOptions {
  if (kind === "image") return {
    size: typeof options["size"] === "string" ? options["size"] : "1024x1024",
    quality: (options["quality"] ?? "high") as ImageOptions["quality"],
    background: (options["background"] ?? "opaque") as ImageOptions["background"],
    model: typeof options["model"] === "string" ? options["model"] : DEFAULT_IMAGE_MODEL,
  };
  return {
    durationS: typeof options["durationS"] === "number" ? options["durationS"] : 5,
    resolution: (options["resolution"] ?? "720p") as VideoOptions["resolution"],
    aspectRatio: typeof options["aspectRatio"] === "string" ? options["aspectRatio"] : "16:9",
    model: typeof options["model"] === "string" ? options["model"] : DEFAULT_VIDEO_MODEL,
    ...(typeof options["seedImage"] === "string" ? { seedImage: options["seedImage"] } : {}),
  };
}

export function requestHash(req: AssetRequestKey): string {
  const normalized = normalizeAssetOptions(req.kind, req.options);
  const options: Record<string, unknown> = { ...normalized };
  delete options["seedImage"];
  return hashJson({ provider: req.provider, kind: req.kind, prompt: req.prompt, options,
    ...(req.seedImageSha ? { seedImageSha: req.seedImageSha } : {}) });
}

export function assetPath(hash: string, kind: AssetKind, extension?: string): string {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Vid2Error("E_INPUT", "invalid asset request hash");
  const ext = extension ?? (kind === "image" ? "png" : "mp4");
  if (!/^[a-z0-9]{1,10}$/.test(ext)) throw new Vid2Error("E_INPUT", "invalid asset extension");
  return join(cacheDir("assets"), `${hash.slice(0, 16)}.${ext}`);
}

function manifestPath(): string { return join(cacheDir("assets"), "manifest.json"); }

export function readManifest(): AssetManifest {
  let raw: string;
  try { raw = readFileSync(manifestPath(), "utf8"); }
  catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Vid2Error("E_PROVIDER", "cannot read asset manifest", { cause });
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("manifest must be an object");
    for (const value of Object.values(parsed)) {
      const asset = value as Partial<MaterializedAsset>;
      if (!asset || typeof asset.path !== "string" || typeof asset.sha256 !== "string" ||
        (asset.kind !== "image" && asset.kind !== "video")) throw new Error("invalid asset entry");
    }
    return parsed as AssetManifest;
  } catch (cause) { throw new Vid2Error("E_PROVIDER", "asset manifest is malformed", { cause }); }
}

export function lookupAsset(hash: string): MaterializedAsset | undefined {
  const entry = readManifest()[hash];
  return entry && existsSync(entry.path) ? entry : undefined;
}

let writeQueue: Promise<void> = Promise.resolve();
export async function recordAsset(hash: string, asset: MaterializedAsset): Promise<void> {
  const write = async (): Promise<void> => {
    if (!existsSync(asset.path)) throw new Vid2Error("E_PROVIDER", "provider returned a missing asset file");
    const target = manifestPath();
    const next = { ...readManifest(), [hash]: asset };
    const temp = `${target}.${process.pid}.${randomUUID()}.tmp`;
    try { await writeFile(temp, JSON.stringify(next, null, 2) + "\n"); await rename(temp, target); }
    catch (cause) { throw new Vid2Error("E_PROVIDER", "cannot update asset manifest", { cause }); }
  };
  const current = writeQueue.then(write, write);
  writeQueue = current.catch(() => {});
  await current;
}

/** The only generation/cache write path; provider output is copied to a stable hash path. */
export async function materializeRequest(provider: AssetProvider, req: GenerateRequest, hash: string): Promise<{ asset: MaterializedAsset; status: "cached" | "generated" }> {
  const hit = lookupAsset(hash);
  if (hit) return { asset: hit, status: "cached" };
  const capabilities = await provider.capabilities();
  const kind = capabilities.kinds[req.kind];
  if (!capabilities.available || !kind?.available) throw new Vid2Error("E_CAPABILITY", `${provider.id} ${req.kind} is unavailable`, {
    details: { provider: provider.id, kind: req.kind, status: kind?.status },
    fix: kind?.reason ?? capabilities.reason ?? `Check ${provider.id} credentials and readiness.`,
  });
  const sourceExt = provider.id === "file" ? extname(req.prompt).slice(1).toLowerCase() : undefined;
  const target = assetPath(hash, req.kind, sourceExt || undefined);
  const generated = await provider.generate(req, target);
  if (generated.kind !== req.kind) throw new Vid2Error("E_PROVIDER", `${provider.id} returned ${generated.kind} for ${req.kind} request`);
  if (!existsSync(generated.path)) throw new Vid2Error("E_PROVIDER", `${provider.id} returned a missing ${req.kind} file`);
  if (resolve(generated.path) !== resolve(target)) await copyFile(generated.path, target);
  const asset: MaterializedAsset = { ...generated, path: target, sha256: await hashFile(target) };
  await recordAsset(hash, asset);
  return { asset, status: "generated" };
}
