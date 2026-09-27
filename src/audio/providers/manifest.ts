/** Content-keyed provider asset manifest; compilation reads it without network access. */
import { existsSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { cacheDir, hashJson, Vid2Error } from "../../shared/index.ts";
import type { AudioAsset, AudioProvider, MusicRequest, ProviderKind, SfxRequest, TtsRequest } from "./port.ts";

export interface RequestKey { provider: string; kind: ProviderKind; params: Record<string, unknown> }
export interface ManifestEntry { path: string; provenance: AudioAsset["provenance"] }
export type AudioManifest = Record<string, ManifestEntry>;

function normalizedParams(params: Record<string, unknown>): Record<string, unknown> {
  const value = { ...params };
  if (value["prompt"] === undefined && value["text"] !== undefined) value["prompt"] = value["text"];
  if (value["durationS"] === undefined && typeof value["durationMs"] === "number") value["durationS"] = value["durationMs"] / 1000;
  if (value["voice"] === undefined && value["voiceId"] !== undefined) value["voice"] = value["voiceId"];
  if (value["model"] === undefined && value["model_id"] !== undefined) value["model"] = value["model_id"];
  if (value["plan"] === undefined && value["composition_plan"] !== undefined) value["plan"] = value["composition_plan"];
  for (const key of ["text", "durationMs", "voiceId", "model_id", "composition_plan", "apiKey", "baseUrl"]) delete value[key];
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

export function requestHash(req: RequestKey): string {
  return hashJson({ provider: req.provider, kind: req.kind, params: normalizedParams(req.params) });
}

function manifestPath(): string { return join(cacheDir("audio"), "manifest.json"); }

export function readManifest(): AudioManifest {
  let raw: string;
  try { raw = readFileSync(manifestPath(), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Vid2Error("E_PROVIDER", "cannot read audio asset manifest", { cause: error });
  }
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("manifest must be an object");
    for (const entry of Object.values(value)) {
      if (!entry || typeof entry !== "object" || typeof (entry as ManifestEntry).path !== "string" ||
        typeof (entry as ManifestEntry).provenance?.provider !== "string") throw new Error("invalid manifest entry");
    }
    return value as AudioManifest;
  } catch (cause) { throw new Vid2Error("E_PROVIDER", "audio asset manifest is malformed", { cause }); }
}

export function lookupAsset(hash: string): ManifestEntry | undefined {
  const entry = readManifest()[hash];
  return entry && existsSync(entry.path) ? entry : undefined;
}

let writeQueue: Promise<void> = Promise.resolve();
export async function recordAsset(hash: string, entry: ManifestEntry): Promise<void> {
  const write = async (): Promise<void> => {
    const path = manifestPath();
    const next = { ...readManifest(), [hash]: JSON.parse(JSON.stringify(entry)) as ManifestEntry };
    const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
    try { await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`); await rename(temp, path); }
    catch (cause) { throw new Vid2Error("E_PROVIDER", "cannot update audio asset manifest", { cause }); }
  };
  const current = writeQueue.then(write, write);
  writeQueue = current.catch(() => {});
  await current;
}

export async function generateAsset(provider: AudioProvider, kind: ProviderKind,
  params: MusicRequest | SfxRequest | TtsRequest): Promise<ManifestEntry> {
  const hash = requestHash({ provider: provider.id, kind, params: params as unknown as Record<string, unknown> });
  const hit = lookupAsset(hash);
  if (hit) return hit;
  if (typeof provider[kind] !== "function") throw new Vid2Error("E_CAPABILITY", `${provider.id} does not support ${kind}`);
  const asset = kind === "music" ? await provider.music!(params as MusicRequest)
    : kind === "sfx" ? await provider.sfx!(params as SfxRequest) : await provider.tts!(params as TtsRequest);
  if (!existsSync(asset.path)) throw new Vid2Error("E_PROVIDER", `${provider.id} returned a missing audio file`);
  const entry = { path: asset.path, provenance: asset.provenance };
  await recordAsset(hash, entry);
  return entry;
}
