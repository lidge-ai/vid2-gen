/** Settled text boxes of a stage spec (030 QA contrast): each text node at the first moment it has been fully visible for 0.4 s. */
import { fpsValue } from "../shared/index.ts";
import { frameItems } from "./scene.ts";
import { SpriteCache } from "./sprites.ts";
import { indexTracks, nodeAt } from "./tracks.ts";
import type { StageSpec } from "./types.ts";

export interface TextBox { frame: number; x: number; y: number; width: number; height: number; color: string; size: number }

export function settledTextBoxes(spec: StageSpec): TextBox[] {
  const index = indexTracks(spec.tracks);
  const sprites = new SpriteCache();
  const texts = new Map(spec.nodes.filter((n) => n.kind === "text").map((n) => [n.key, n]));
  const firstOpaque = new Map<string, number>();
  const hold = Math.round(0.4 * fpsValue(spec.fps));
  const found = new Map<string, TextBox>();
  const step = Math.max(1, Math.round(fpsValue(spec.fps) / 10));
  for (let f = 0; f < spec.frames && found.size < texts.size; f += step) {
    for (const item of frameItems(spec, index, f, sprites)) {
      const node = texts.get(item.key);
      if (!node || found.has(item.key) || !item.rect) continue;
      if (item.opacity < 0.99) { firstOpaque.delete(item.key); continue; }
      const since = firstOpaque.get(item.key) ?? f;
      firstOpaque.set(item.key, since);
      if (f - since < hold) continue;
      const evaluated = nodeAt(node, index, f, spec.fps);
      if (evaluated.kind !== "text") continue;
      found.set(item.key, { frame: f, x: item.rect.x0, y: item.rect.y0, width: item.rect.x1 - item.rect.x0, height: item.rect.y1 - item.rect.y0,
        color: evaluated.color, size: evaluated.size });
    }
  }
  return [...found.values()];
}
