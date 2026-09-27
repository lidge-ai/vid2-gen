/** One frame of a stage: evaluate every node, resolve world transforms through groups, and emit ordered draw items. */
import type { Fps } from "../shared/index.ts";
import { IDENTITY, bounds, invert, multiply, union } from "./composite.ts";
import type { Clip, Matrix, Rect } from "./composite.ts";
import { blurMix, nodeBox, nodePieces, scaleBucket } from "./sprites.ts";
import type { Piece, SpriteCache } from "./sprites.ts";
import { nodeAt, parseColor } from "./tracks.ts";
import type { TrackIndex } from "./tracks.ts";
import type { StageNode, StageSpec } from "./types.ts";

export interface DrawPart { piece: Piece; matrix: Matrix; weight: number }
export interface DrawItem { key: string; parts: DrawPart[]; opacity: number; clips: Clip[]; rect: Rect | null; signature: string }

interface World { matrix: Matrix; opacity: number; clips: Clip[] }

function localMatrix(n: StageNode, box: { width: number; height: number }): Matrix {
  const rad = (n.rotation * Math.PI) / 180;
  const sx = n.scale * n.scaleX;
  const sy = n.scale * n.scaleY;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rs: Matrix = [cos * sx, sin * sx, -sin * sy, cos * sy, n.x, n.y];
  return multiply(rs, [1, 0, 0, 1, -n.anchorX * box.width, -n.anchorY * box.height]);
}

function worldOf(node: StageNode, nodes: Map<string, StageNode>, cache: Map<string, World>): World {
  const hit = cache.get(node.key);
  if (hit) return hit;
  const parent = node.parent ? nodes.get(node.parent) : undefined;
  const base: World = parent ? worldOf(parent, nodes, cache) : { matrix: IDENTITY, opacity: 1, clips: [] };
  const matrix = multiply(base.matrix, localMatrix(node, nodeBox(node)));
  let clips = base.clips;
  if (node.kind === "group" && node.clip) {
    const c = node.clip;
    clips = [...clips, { inverse: invert(matrix), hx: c.width / 2, hy: c.height / 2, cx: c.x + c.width / 2, cy: c.y + c.height / 2,
      radius: Math.min(c.radius, c.width / 2, c.height / 2) }];
  }
  const world = { matrix, opacity: base.opacity * node.opacity, clips };
  cache.set(node.key, world);
  return world;
}

function spriteMatrix(world: Matrix, piece: Piece): Matrix {
  const s = piece.sprite;
  return multiply(world, [1 / s.scale, 0, 0, 1 / s.scale, piece.dx - s.ox / s.scale, piece.dy - s.oy / s.scale]);
}

function itemFor(node: StageNode, world: World, sprites: SpriteCache): DrawItem {
  const m = world.matrix;
  const scale = scaleBucket(Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3])));
  const { low, high, t } = blurMix(node.blur);
  const parts: DrawPart[] = [];
  for (const [level, weight] of [[low, 1 - t], [high, t]] as const) {
    if (weight <= 0.001) continue;
    for (const piece of nodePieces(node, sprites, scale, level)) parts.push({ piece, matrix: spriteMatrix(m, piece), weight });
  }
  let rect: Rect | null = null;
  for (const p of parts) rect = union(rect, bounds(p.matrix, p.piece.sprite.width, p.piece.sprite.height));
  const tints = parts.map((p) => p.piece.tint ?? "").join(",");
  const signature = JSON.stringify([m.map((v) => v.toFixed(4)), world.opacity.toFixed(4), node.blur.toFixed(3), tints,
    parts.map((p) => p.piece.sprite.width + "x" + p.piece.sprite.height + ":" + p.weight.toFixed(3)), world.clips.length]);
  return { key: node.key, parts, opacity: world.opacity, clips: world.clips, rect, signature: node.kind + signature + contentKey(node) };
}

function contentKey(node: StageNode): string {
  if (node.kind === "text") return node.text + "|" + (node.reveal ?? "") + "|" + node.size;
  if (node.kind === "rect") return `${node.width}|${node.height}|${node.radius}`;
  if (node.kind === "icon") return `${node.size}|${node.progress}`;
  return "";
}

/** Draw items for a frame in paint order (z, then declaration order). Invisible nodes are omitted. */
export function frameItems(spec: StageSpec, index: TrackIndex, frame: number, sprites: SpriteCache): DrawItem[] {
  const evaluated = new Map(spec.nodes.map((n) => [n.key, nodeAt(n, index, frame, spec.fps)]));
  const worlds = new Map<string, World>();
  const ordered = [...evaluated.values()].map((n, i) => ({ n, i })).sort((a, b) => a.n.z - b.n.z || a.i - b.i);
  const items: DrawItem[] = [];
  for (const { n } of ordered) {
    const world = worldOf(n, evaluated, worlds);
    if (n.kind === "group" || world.opacity <= 0.001) continue;
    items.push(itemFor(n, world, sprites));
  }
  return items;
}

export function tintOf(color: string | null): [number, number, number, number] | null {
  if (color === null) return null;
  const [r, g, b, a] = parseColor(color);
  return [r / 255, g / 255, b / 255, a / 255];
}

export type { Fps };
