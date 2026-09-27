/** --placeholders (060, normative): missing media become labelled stripe PNG image sources; missing audio is dropped with a warning. */
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { cachedPng, encodePng } from "../compile/png.ts";
import { cacheDir, sha256 } from "../shared/index.ts";
import type { Timeline } from "../timeline/index.ts";

/** Diagonal stripes in a hue derived from the source id, so different placeholders are distinguishable. */
export function placeholderPng(sourceId: string, t: Timeline): string {
  const width = Math.max(16, Math.min(1920, t.output.width));
  const height = Math.max(16, Math.min(1920, t.output.height));
  const hue = parseInt(sha256(sourceId).slice(0, 2), 16) / 255;
  const [r, g, b] = [0, 2, 4].map((o) => Math.round(90 + 60 * Math.cos(2 * Math.PI * (hue + o / 6))));
  return cachedPng(cacheDir("placeholders"), { sourceId, width, height, v: 1 }, () => {
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const band = Math.floor((x + y) / 48) % 2 === 0;
      data[i] = band ? r! : 34; data[i + 1] = band ? g! : 38; data[i + 2] = band ? b! : 46; data[i + 3] = 255;
    }
    return encodePng(width, height, 4, data);
  });
}

type Sources = Timeline["sources"];

/** Missing file sources: image/video → placeholder PNG image; audio → removed from music/voice/cues. */
export function placeholderFiles(t: Timeline, baseDir: string): { timeline: Timeline; warnings: string[] } {
  const sources: Sources = { ...t.sources };
  const warnings: string[] = [];
  const droppedAudio = new Set<string>();
  for (const [id, s] of Object.entries(t.sources)) {
    if (!("path" in s)) continue;
    const path = isAbsolute(s.path) ? s.path : resolve(baseDir, s.path);
    if (existsSync(path)) continue;
    warnings.push(`W_PLACEHOLDER ${id}`);
    if (s.type === "audio") { droppedAudio.add(id); continue; }
    sources[id] = { type: "image", path: placeholderPng(id, t) };
  }
  const audio = t.audio && droppedAudio.size ? {
    ...t.audio,
    ...(t.audio.music && "source" in t.audio.music && droppedAudio.has(t.audio.music.source) ? { music: undefined } : {}),
    voice: t.audio.voice.filter((v) => !("source" in v && droppedAudio.has(v.source))),
    cues: t.audio.cues.filter((c) => !droppedAudio.has(c.sfx)),
  } : t.audio;
  if (audio && "music" in audio && audio.music === undefined) delete (audio as { music?: unknown }).music;
  return { timeline: { ...t, sources, ...(audio ? { audio } : {}) }, warnings };
}
