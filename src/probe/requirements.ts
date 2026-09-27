import { Vid2Error } from "../shared/index.ts";
import type { FfmpegInfo } from "./ffmpeg.ts";

export interface FeatureRequirements {
  filters?: string[];
  encoders?: string[];
  decoders?: string[];
  libs?: (keyof FfmpegInfo["libs"])[];
}

export function requireFeatures(info: FfmpegInfo, needs: FeatureRequirements, context: string): void {
  const missing = [
    ...(needs.filters ?? []).filter((name) => !info.filters.has(name)).map((name) => `filter:${name}`),
    ...(needs.encoders ?? []).filter((name) => !info.encoders.has(name)).map((name) => `encoder:${name}`),
    ...(needs.decoders ?? []).filter((name) => !info.decoders.has(name)).map((name) => `decoder:${name}`),
    ...(needs.libs ?? []).filter((name) => !info.libs[name]).map((name) => `lib:${name}`),
  ];
  if (missing.length) throw new Vid2Error("E_CAPABILITY", `${context} needs unavailable FFmpeg features: ${missing.join(", ")}`, {
    details: { context, missing }, fix: "Install an FFmpeg build with the listed features enabled.",
  });
}
