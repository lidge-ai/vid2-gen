/** ima2 video request guard contract (devlog 260928_film_grammar/040 + reflection 041). Constants and signature by main; W1 fills the body. */
import type { VideoOptions } from "./provider.ts";
import { Vid2Error } from "../shared/index.ts";
import { isAbsolute } from "node:path";
import { DEFAULT_VIDEO_MODEL } from "./provider.ts";

export const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
/** From ima2 3.23.1 `video --help`; the CLI documents no per-model list. */
export const VIDEO_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "auto"] as const;
export const VIDEO_OPTION_KEYS = ["durationS", "resolution", "aspectRatio", "model", "seedImage", "referenceImages", "timeoutS"] as const;

/** `vid2 assets gen` flag for each option key, so a flag-style error path names what the user typed. */
const FLAG_FOR_KEY: Record<string, string> = { durationS: "--duration", resolution: "--resolution", aspectRatio: "--aspect-ratio",
  model: "--model", seedImage: "--seed-image", referenceImages: "--ref", timeoutS: "--timeout" };

function failer(prefix: string): (key: string, message: string) => never {
  return (key, message) => {
    const path = prefix.startsWith("--") ? FLAG_FOR_KEY[key] ?? `--${key}` : `${prefix}.${key}`;
    throw new Vid2Error("E_INPUT", message, { details: { path } });
  };
}

function checkReferences(value: unknown, model: string, fail: (key: string, message: string) => never): string[] {
  const limit = model.startsWith("grok/") ? 7 : 3;
  if (!Array.isArray(value) || value.length < 1 || value.length > limit ||
    value.some((item: unknown) => typeof item !== "string" || !isAbsolute(item)))
    fail("referenceImages", `referenceImages must contain 1 to ${limit} absolute paths on model ${model}`);
  return value as string[];
}

/**
 * Pure and offline. Rules: unknown keys rejected; durationS integer 1..15; resolution and aspectRatio from the lists above;
 * seedImage and referenceImages mutually exclusive; referenceImages absolute paths, 1..7 on a "grok/" model lane, else 1..3;
 * any referenceImages caps resolution at 720p (seedImage may use 1080p). Throws Vid2Error("E_INPUT", message,
 * { details: { path: `${prefix}.${key}` } }); prefix is "sources.<id>.options", or "--flag" style for `vid2 assets gen`.
 * Callers resolve seedImage and referenceImages to absolute paths first (requestFor against the timeline folder, assets gen
 * against cwd); file existence is checked after the guard.
 */
export function checkIma2VideoOptions(raw: Record<string, unknown>, prefix: string): VideoOptions {
  const fail: (key: string, message: string) => never = failer(prefix);
  for (const key of Object.keys(raw)) if (!(VIDEO_OPTION_KEYS as readonly string[]).includes(key)) fail(key, `unknown video option: ${key}`);
  const durationS: unknown = raw["durationS"] ?? 5;
  const resolution: unknown = raw["resolution"] ?? "720p";
  const aspectRatio: unknown = raw["aspectRatio"] ?? "16:9";
  const model: unknown = raw["model"] ?? DEFAULT_VIDEO_MODEL;
  if (typeof durationS !== "number" || !Number.isInteger(durationS) || durationS < 1 || durationS > 15)
    fail("durationS", "durationS must be an integer from 1 to 15");
  if (!(VIDEO_RESOLUTIONS as readonly unknown[]).includes(resolution))
    fail("resolution", `resolution must be one of ${VIDEO_RESOLUTIONS.join(", ")}`);
  if (!(VIDEO_ASPECTS as readonly unknown[]).includes(aspectRatio))
    fail("aspectRatio", `aspectRatio must be one of ${VIDEO_ASPECTS.join(", ")}`);
  if (typeof model !== "string" || !model.trim()) fail("model", "model must be a nonempty string");
  const seedImage: unknown = raw["seedImage"];
  if (seedImage !== undefined && (typeof seedImage !== "string" || !isAbsolute(seedImage)))
    fail("seedImage", "seedImage must be an absolute path");
  const referenceImages = raw["referenceImages"] === undefined ? undefined : checkReferences(raw["referenceImages"], model, fail);
  if (referenceImages !== undefined) {
    if (seedImage !== undefined) fail("referenceImages", "referenceImages and seedImage are mutually exclusive");
    if (resolution === "1080p") fail("resolution", "referenceImages require 720p or lower");
  }
  const timeoutS: unknown = raw["timeoutS"];
  if (timeoutS !== undefined && (typeof timeoutS !== "number" || !Number.isFinite(timeoutS) || timeoutS <= 0))
    fail("timeoutS", "timeoutS must be positive seconds");
  return { durationS, resolution: resolution as VideoOptions["resolution"], aspectRatio: aspectRatio as string, model,
    ...(typeof seedImage === "string" ? { seedImage } : {}), ...(referenceImages ? { referenceImages } : {}),
    ...(typeof timeoutS === "number" ? { timeoutS } : {}) };
}
