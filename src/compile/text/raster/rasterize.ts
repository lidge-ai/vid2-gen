/** Flatten OpenType curves, then fill with non-zero winding and 4x vertical area sampling. */
import type { Command, FontPath } from "opentype.js";

interface Point { x: number; y: number }
interface Edge { a: Point; b: Point }
const STEPS = 12;

function quad(a: Point, c: Point, b: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

function cubic(a: Point, c1: Point, c2: Point, b: Point, t: number): Point {
  const u = 1 - t;
  return { x: u ** 3 * a.x + 3 * u ** 2 * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * b.x,
    y: u ** 3 * a.y + 3 * u ** 2 * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * b.y };
}

function xy(command: Command): Point { return { x: command.x ?? 0, y: command.y ?? 0 }; }

export function flattenPaths(paths: FontPath[], tolerance = 0.25): Edge[] {
  const edges: Edge[] = [];
  for (const path of paths) {
    let current: Point = { x: 0, y: 0 };
    let start = current;
    const push = (next: Point): void => { edges.push({ a: current, b: next }); current = next; };
    for (const command of path.commands) {
      if (command.type === "M") { current = xy(command); start = current; continue; }
      if (command.type === "L") { push(xy(command)); continue; }
      if (command.type === "Z") { push(start); continue; }
      const end = xy(command);
      const distance = Math.hypot(end.x - current.x, end.y - current.y);
      const steps = Math.max(STEPS, Math.ceil(distance / Math.max(0.05, tolerance * 8)));
      const origin = current;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        if (command.type === "Q") push(quad(origin, { x: command.x1 ?? 0, y: command.y1 ?? 0 }, end, t));
        if (command.type === "C") push(cubic(origin, { x: command.x1 ?? 0, y: command.y1 ?? 0 },
          { x: command.x2 ?? 0, y: command.y2 ?? 0 }, end, t));
      }
    }
  }
  return edges.filter(edge => edge.a.y !== edge.b.y);
}

/** Returns 8-bit alpha; each row uses 4 vertical samples with exact horizontal interval coverage. */
export function rasterizePaths(paths: FontPath[], width: number, height: number): Uint8Array {
  const edges = flattenPaths(paths);
  const sums = new Float32Array(width * height);
  for (let row = 0; row < height; row++) for (let sub = 0; sub < 4; sub++) {
    const y = row + (sub + 0.5) / 4;
    const hits: { x: number; winding: number }[] = [];
    for (const { a, b } of edges) {
      if (y < Math.min(a.y, b.y) || y >= Math.max(a.y, b.y)) continue;
      hits.push({ x: a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y), winding: b.y > a.y ? 1 : -1 });
    }
    hits.sort((a, b) => a.x - b.x);
    let winding = 0;
    for (let i = 0; i + 1 < hits.length; i++) {
      winding += hits[i]!.winding;
      if (winding === 0) continue;
      const left = Math.max(0, hits[i]!.x);
      const right = Math.min(width, hits[i + 1]!.x);
      for (let x = Math.max(0, Math.floor(left)); x < Math.min(width, Math.ceil(right)); x++) {
        sums[row * width + x]! += Math.max(0, Math.min(x + 1, right) - Math.max(x, left)) / 4;
      }
    }
  }
  return Uint8Array.from(sums, value => Math.round(Math.min(1, value) * 255));
}
