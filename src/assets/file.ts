/** Local-file provider: probes a supplied path and copies it into the asset cache. */
import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { probeMedia } from "../probe/index.ts";
import { hashFile, Vid2Error } from "../shared/index.ts";
import { normalizeAssetOptions } from "./manifest.ts";
import type { AssetProvider, GenerateRequest, MaterializedAsset } from "./provider.ts";

export function createFileProvider(): AssetProvider {
  return {
    id: "file",
    async capabilities() { return { provider: "file", available: true,
      kinds: { image: { available: true, status: "ready" }, video: { available: true, status: "ready",
        maxSeconds: 3600, resolutions: ["480p", "720p", "1080p"] as ("480p" | "720p" | "1080p")[], fromImage: false, continue: false } } }; },
    normalize: normalizeAssetOptions,
    async generate(req: GenerateRequest, outPath: string): Promise<MaterializedAsset> {
      const source = resolve(req.prompt);
      const media = await probeMedia(source);
      if (media.kind !== req.kind) throw new Vid2Error("E_INPUT", `file is ${media.kind}, expected ${req.kind}: ${source}`);
      if (source !== resolve(outPath)) await copyFile(source, outPath);
      return { path: outPath, kind: req.kind, ...(media.width ? { width: media.width } : {}),
        ...(media.height ? { height: media.height } : {}), ...(media.duration ? { durationS: media.duration } : {}),
        sha256: await hashFile(outPath), provenance: { provider: "file", params: { source }, createdAt: new Date().toISOString() } };
    },
  };
}
