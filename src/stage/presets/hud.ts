/** Fixed full-frame HUD layout. All authored dimensions are scaled once by SpecBuilder. */
import type { Fps } from "../../shared/index.ts";
import type { ResolvedHud } from "../../timeline/film.ts";
import { NODE_BASE, SpecBuilder } from "./builder.ts";
import type { StageSpec } from "../types.ts";

export interface HudStageOptions {
  width: number; height: number; scale: number; fps: Fps; frames: number; fontPath: string;
  /** Absolute output frame represented by stage frame zero. */
  base: number;
  /** Counter and ticker frames relative to this chunk's stage frame zero. */
  counterKeys: ResolvedHud["counterKeys"];
  tickerItems: ResolvedHud["tickerItems"];
}

function rectangle(b: SpecBuilder, key: string, x: number, y: number, width: number, height: number, fill: string): void {
  b.add({ ...NODE_BASE, kind: "rect", key, x, y, width, height, radius: 0, fill, strokeWidth: 0 });
}

function text(b: SpecBuilder, key: string, content: string, x: number, y: number, anchorX: number,
  color: string, size: number, font: string): void {
  b.add({ ...NODE_BASE, kind: "text", key, text: content, x, y, anchorX, font, size, color, letterSpacing: 0 });
}

function brackets(b: SpecBuilder, h: ResolvedHud, width: number, height: number): void {
  if (!h.corners) return;
  const m = h.margin;
  const arm = h.size * 1.5;
  const stroke = Math.max(2, h.size / 14);
  for (const [side, x] of [["left", m], ["right", width - m]] as const) {
    for (const [edge, y] of [["top", m], ["bottom", height - m]] as const) {
      const inward = side === "left" ? 1 : -1;
      const down = edge === "top" ? 1 : -1;
      rectangle(b, `hud:${edge}:${side}:h`, x + inward * arm / 2, y, arm, stroke, h.color);
      rectangle(b, `hud:${edge}:${side}:v`, x, y + down * arm / 2, stroke, arm, h.color);
    }
  }
}

function ticker(b: SpecBuilder, h: ResolvedHud, opts: HudStageOptions, width: number, height: number): void {
  if (!h.ticker) return;
  rectangle(b, "hud:ticker:strip", width / 2, height - h.ticker.height / 2, width, h.ticker.height, h.ticker.background);
  const items = opts.tickerItems;
  let active = 0;
  items.forEach((item, i) => { if (item.frame <= 0) active = i; });
  items.forEach((item, i) => {
    const key = `hud:ticker:${i}`;
    text(b, key, item.text, h.margin, height - h.ticker!.height / 2, 0, h.color, h.size * 0.72, opts.fontPath);
    const keys = [{ frame: 0, value: i === active ? 1 : 0 }];
    if (i !== active && item.frame > 0) keys.push({ frame: item.frame, value: 1 });
    const next = items[i + 1];
    if (next && next.frame > 0) keys.push({ frame: next.frame, value: 0 });
    b.tracks.push({ node: key, prop: "opacity", keys: keys.map((k) => ({ ...k, ease: "hold" as const })) });
  });
}

/** Build a HUD clip with no sound events; the caller supplies chunk-local key/item frames. */
export function buildHudSpec(h: ResolvedHud, opts: HudStageOptions): StageSpec {
  const b = new SpecBuilder(opts.fps.num / opts.fps.den, opts.scale);
  const width = opts.width / opts.scale;
  const height = opts.height / opts.scale;
  brackets(b, h, width, height);
  const inset = h.margin + h.size * 0.55;
  const top = h.margin + h.size * 0.65;
  const bottom = height - h.margin - (h.ticker?.height ?? 0) - h.size * 0.65;
  if (h.label) text(b, "hud:label", h.label, inset, top, 0, h.color, h.size, opts.fontPath);
  if (h.counter) {
    const key = "hud:counter";
    text(b, key, "0", width - inset, top, 1, h.accent ?? h.color, h.size, opts.fontPath);
    const node = b.nodes[b.nodes.length - 1]!;
    if (node.kind === "text") node.keyed = { ...h.counter, keys: opts.counterKeys, mode: h.counter.mode };
  }
  if (h.timecode) {
    const key = "hud:timecode";
    text(b, key, "00:00:00:00", inset, bottom, 0, h.color, h.size * 0.8, opts.fontPath);
    const node = b.nodes[b.nodes.length - 1]!;
    if (node.kind === "text") node.timecode = { ...h.timecode, base: opts.base, origin: h.startFrame, fps: opts.fps };
  }
  ticker(b, h, opts, width, height);
  return b.spec(opts.width, opts.height, opts.fps, opts.frames);
}
