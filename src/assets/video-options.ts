/** ima2 video request guard contract (devlog 260928_film_grammar/040 + reflection 041). Constants and signature by main; W1 fills the body. */
import type { VideoOptions } from "./provider.ts";

export const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
/** From ima2 3.23.1 `video --help`; the CLI documents no per-model list. */
export const VIDEO_ASPECTS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "auto"] as const;
export const VIDEO_OPTION_KEYS = ["durationS", "resolution", "aspectRatio", "model", "seedImage", "referenceImages", "timeoutS"] as const;

/**
 * Pure and offline. Rules: unknown keys rejected; durationS integer 1..15; resolution and aspectRatio from the lists above;
 * seedImage and referenceImages mutually exclusive; referenceImages absolute paths, 1..7 on a "grok/" model lane, else 1..3;
 * any referenceImages caps resolution at 720p (seedImage may use 1080p). Throws Vid2Error("E_INPUT", message,
 * { details: { path: `${prefix}.${key}` } }); prefix is "sources.<id>.options", or "--flag" style for `vid2 assets gen`.
 * Callers resolve seedImage and referenceImages to absolute paths first (requestFor against the timeline folder, assets gen
 * against cwd); file existence is checked after the guard.
 */
export function checkIma2VideoOptions(raw: Record<string, unknown>, prefix: string): VideoOptions {
  void raw; void prefix;
  throw new Error("checkIma2VideoOptions: not implemented (wp5 W1)");
}
