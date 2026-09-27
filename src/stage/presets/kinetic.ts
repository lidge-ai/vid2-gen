/**
 * Kinetic typography (020): a sequence of token states compiled to stage nodes. Tokens are actors identified by key; a token present in
 * consecutive states springs to its new layout position (magic move), new tokens enter with the configured style, missing ones exit.
 */
import { measureText } from "../raster.ts";
import { NODE_BASE } from "./builder.ts";
import type { SpecBuilder } from "./builder.ts";
import { colorKeys, enterGlyph, enterNode, exitNode, seeded } from "./entrances.ts";
import type { MotionConfig } from "./entrances.ts";
import { cameraKeys, expandKeys, pillKeys } from "./kinetic-frame.ts";
import { GROUP, moveKeys } from "./kinetic-types.ts";
import type { Actor, KineticConfig } from "./kinetic-types.ts";
import { iconSize, layoutTokens } from "./layout.ts";
import { assignKeys, tokenize } from "./tokens.ts";
import type { AuthoredToken, Token } from "./tokens.ts";

export type { KineticConfig } from "./kinetic-types.ts";

export function kineticStates(states: { text?: string | undefined; tokens?: AuthoredToken[] | undefined }[]): Token[][] {
  return states.map((s) => assignKeys(s.tokens ?? tokenize(s.text ?? "")));
}

function motion(c: KineticConfig): MotionConfig {
  return { duration: c.enter.duration, distance: c.enter.distance, blur: c.enter.blur, exit: c.exit };
}

/**
 * Walk the states: every on-screen token is an actor with a unique id (key, or key@state when a key returns after leaving); it gets
 * its appearance time, its layout box per state and its exit time.
 */
function actors(c: KineticConfig): Map<string, Actor> {
  const all = new Map<string, Actor>();
  const live = new Map<string, Actor>();
  c.states.forEach((state, si) => {
    const layout = layoutTokens(state.tokens, c.layout);
    const present = new Set(state.tokens.map((t) => t.key));
    let exits = 0;
    for (const [key, actor] of live) if (!present.has(key)) { actor.gone = state.at; live.delete(key); exits++; }
    // New tokens wait for leaving ones to clear (their exit duration) so the two never overlap on screen.
    const delay = si === 0 ? 0 : exits ? c.exit.duration : 0.08;
    let entering = 0;
    for (const token of state.tokens) {
      const existing = live.get(token.key);
      const p = layout.placed.get(token.key)!;
      if (existing) { existing.placements.push({ t: state.at, p }); continue; }
      const appear = state.at + delay + entering++ * c.enter.stagger;
      const actor: Actor = { token, appear, placements: [{ t: state.at, p }] };
      all.set(all.has(token.key) ? `${token.key}@${si}` : token.key, actor);
      live.set(token.key, actor);
    }
  });
  return all;
}

function textActor(b: SpecBuilder, id: string, a: Actor, c: KineticConfig): void {
  const first = a.placements[0]!.p;
  const style = a.token.enter ?? c.enter.style;
  const color = a.token.color ?? c.color;
  const perGlyph = style === "drop" || style === "type" || style === "scramble";
  const m = motion(c);
  b.add({ ...NODE_BASE, kind: "group", key: id, parent: GROUP, x: first.x, y: first.y, anchorX: 0, anchorY: 0 });
  b.key(id, "x", moveKeys(a, (p) => p.x, c.move));
  b.key(id, "y", moveKeys(a, (p) => p.y, c.move));
  const glyphKeys: string[] = [];
  if (!perGlyph) {
    const key = `${id}:t`;
    b.add({ ...NODE_BASE, kind: "text", key, parent: id, text: a.token.text!, font: c.layout.fontPath, size: c.layout.size, color,
      letterSpacing: c.letterSpacing, x: 0, y: 0, anchorX: 0, anchorY: 0.5 });
    enterNode(b, key, style, a.appear, m, 0);
    colorKeys(b, key, a.appear, { color, accent: a.token.accent === false ? undefined : c.accent, highlight: highlightAt(a, c) });
    glyphKeys.push(key);
  } else glyphKeys.push(...glyphActors(b, id, a, c, style, color));
  b.event(a.appear, style === "type" || style === "scramble" ? "glyph" : "token");
  if (a.gone !== undefined) exitNode(b, id, a.gone, m, first.y, glyphKeys);
}

function highlightAt(a: Actor, c: KineticConfig): { dim: string; at: number } | undefined {
  if (!c.highlight) return undefined;
  const state = c.states.find((s) => s.at <= a.appear && s.tokens.some((t) => t.key === a.token.key));
  const order = state ? state.tokens.findIndex((t) => t.key === a.token.key) : 0;
  const lastAppear = state ? state.at + Math.max(0, state.tokens.length - 1) * c.enter.stagger + c.enter.duration : a.appear;
  return { dim: c.highlight.dim, at: lastAppear + c.highlight.delay + order * c.highlight.sweep };
}

/** One text node per glyph at its advance offset; drop/type/scramble entrances staggered by glyphStagger. */
function glyphActors(b: SpecBuilder, id: string, a: Actor, c: KineticConfig, style: string, color: string): string[] {
  const text = [...a.token.text!];
  const m = measureText(c.layout.fontPath, a.token.text ?? "", c.layout.size, c.letterSpacing);
  const keys: string[] = [];
  text.forEach((ch, i) => {
    if (!ch.trim()) return;
    const key = `${id}:g${i}`;
    const t = a.appear + i * c.enter.glyphStagger;
    b.add({ ...NODE_BASE, kind: "text", key, parent: id, text: ch, font: c.layout.fontPath, size: c.layout.size, color,
      letterSpacing: 0, x: m.advances[i]!, y: 0, anchorX: 0, anchorY: 0.5 });
    enterGlyph(b, key, style === "scramble" ? "type" : style, style === "scramble" ? a.appear : t, motion(c));
    if (style === "scramble") scramble(b, key, a.appear, t + c.enter.duration * 0.5);
    colorKeys(b, key, t, { color, accent: a.token.accent === false ? undefined : c.accent });
    keys.push(key);
  });
  if (style === "type") for (let i = 0; i < text.length; i += 3) b.event(a.appear + i * c.enter.glyphStagger, "glyph");
  return keys;
}

const SCRAMBLE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789#$%&*+<>?";

/** Scramble: the glyph cycles through seeded random characters every 2 stage frames until it resolves. */
function scramble(b: SpecBuilder, key: string, from: number, resolve: number): void {
  const node = b.nodes.find((n) => n.key === key);
  if (node?.kind !== "text") return;
  const rand = seeded(key);
  const chars = Array.from({ length: 12 }, () => SCRAMBLE[Math.floor(rand() * SCRAMBLE.length)]!).join("");
  node.scramble = { chars, from: b.frame(from), until: b.frame(resolve), step: 2 };
}

function iconActor(b: SpecBuilder, id: string, a: Actor, c: KineticConfig): void {
  const first = a.placements[0]!.p;
  const size = iconSize(c.layout);
  const source = c.icons(a.token.icon ?? "");
  const color = a.token.color ?? c.color;
  b.add({ ...NODE_BASE, kind: "group", key: id, parent: GROUP, x: first.x + size / 2, y: first.y, anchorX: 0, anchorY: 0 });
  b.key(id, "x", moveKeys(a, (p) => p.x + size / 2, c.move));
  b.key(id, "y", moveKeys(a, (p) => p.y, c.move));
  const key = `${id}:i`;
  if ("paths" in source) b.add({ ...NODE_BASE, kind: "icon", key, parent: id, paths: source.paths, size, color, strokeWidth: c.iconStroke, progress: 1 });
  else b.add({ ...NODE_BASE, kind: "image", key, parent: id, image: source.image, width: size, height: size, radius: size * 0.22, fit: "cover" });
  enterNode(b, key, a.token.enter ?? "pop", a.appear, motion(c), 0);
  if ("paths" in source) colorKeys(b, key, a.appear, { color, accent: a.token.accent === false ? undefined : c.accent });
  b.event(a.appear, "icon");
  if (a.gone !== undefined) exitNode(b, id, a.gone, motion(c), first.y, [key]);
}



/** Compile a kinetic layer into the builder. */
export function buildKinetic(b: SpecBuilder, c: KineticConfig): void {
  b.add({ ...NODE_BASE, kind: "group", key: GROUP, anchorX: 0, anchorY: 0 });
  const all = actors(c);
  for (const [id, a] of all) {
    const nodeId = "kin:" + id;
    if (a.token.icon !== undefined) iconActor(b, nodeId, a, c); else textActor(b, nodeId, a, c);
  }
  for (const [si, s] of c.states.entries()) {
    if (si === 0) continue;
    const moved = [...all.values()].filter((a) => a.placements.some((pl) => pl.t === s.at) && a.placements.length > 1).length;
    if (moved >= 3) b.event(s.at, "state");
  }
  pillKeys(b, c, all);
  const camera = cameraKeys(b, c, all);
  expandKeys(b, c, all, camera);
}


