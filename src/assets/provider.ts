/** Asset provider port (050). Providers run only for 'vid2 assets resolve' or 'render --generate'; compile reads the manifest. */
import type { Runner } from "../shared/index.ts";

export type AssetKind = "image" | "video";
/** Per-kind readiness: a provider can be reachable while one kind is not (ima2: image ready, Grok video disconnected). */
export interface KindStatus { available: boolean; status: string; lane?: string; model?: string; reason?: string }
export interface ProviderCapabilities {
  provider: string;
  /** The provider CLI/server is reachable. */
  available: boolean;
  reason?: string;
  version?: string;
  kinds: {
    image?: KindStatus & { sizes?: string[]; backgrounds?: ("opaque" | "transparent" | "chroma-green")[] };
    video?: KindStatus & { maxSeconds: number; resolutions: ("480p" | "720p" | "1080p")[]; fromImage: boolean; continue: boolean };
    analyze?: boolean;
  };
}
/** Canonical, defaulted options (the adapter's normalize()); these and the seed bytes form the request hash. */
export interface ImageOptions { size: string; quality: "high" | "medium" | "low"; background: "opaque" | "transparent" | "chroma-green"; model: string }
export interface VideoOptions { durationS: number; resolution: "480p" | "720p" | "1080p"; aspectRatio: string; model: string; seedImage?: string;
  /** Absolute reference image paths in order (041); mutually exclusive with seedImage; hashed as referenceImagesSha. */
  referenceImages?: string[];
  /** Provider wait limit; not part of the request identity. */
  timeoutS?: number }
export interface GenerateRequest { kind: AssetKind; prompt: string; options: ImageOptions | VideoOptions; seedImageSha?: string; referenceImagesSha?: string[] }
export interface MaterializedAsset {
  path: string; kind: AssetKind; width?: number; height?: number; durationS?: number; sha256: string;
  provenance: { provider: string; requestId?: string; model?: string; revisedPrompt?: string; params: Record<string, unknown>; createdAt: string };
}
export interface AssetProvider {
  id: string;
  capabilities(): Promise<ProviderCapabilities>;
  /** Fill defaults from authored options (pure, offline) so equal requests hash equally. */
  normalize(kind: AssetKind, options: Record<string, unknown>): ImageOptions | VideoOptions;
  generate(req: GenerateRequest, outPath: string, signal?: AbortSignal): Promise<MaterializedAsset>;
  analyze?(videoPath: string): Promise<{ text: string; method: string }>;
}
export interface ProviderContext { runner?: Runner; env?: NodeJS.ProcessEnv }

export const DEFAULT_IMAGE_MODEL = "oauth/gpt-image-2";
export const DEFAULT_VIDEO_MODEL = "grok/grok-imagine-video-1.5";
