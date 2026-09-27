/** SVG path data (24×24 icon view box) → flattened polylines, with partial-length drawing for line-draw animation. */
import type { Polyline } from "../raster.ts";

interface Pt { x: number; y: number }
type Cmd = { op: string; args: number[] };

function tokenize(d: string): Cmd[] {
  const out: Cmd[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g;
  let current: Cmd | undefined;
  for (const m of d.matchAll(re)) {
    if (m[1]) { current = { op: m[1], args: [] }; out.push(current); }
    else if (current) current.args.push(Number(m[2]));
  }
  return out;
}

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function bezier(p: Pt[], t: number): Pt {
  const u = 1 - t;
  if (p.length === 3) return { x: u * u * p[0]!.x + 2 * u * t * p[1]!.x + t * t * p[2]!.x, y: u * u * p[0]!.y + 2 * u * t * p[1]!.y + t * t * p[2]!.y };
  return { x: u ** 3 * p[0]!.x + 3 * u * u * t * p[1]!.x + 3 * u * t * t * p[2]!.x + t ** 3 * p[3]!.x,
    y: u ** 3 * p[0]!.y + 3 * u * u * t * p[1]!.y + 3 * u * t * t * p[2]!.y + t ** 3 * p[3]!.y };
}

/** Endpoint arc → points (SVG implementation notes F.6.5). */
function arcPoints(from: Pt, a: number[], to: Pt): Pt[] {
  let [rx, ry] = [Math.abs(a[0]!), Math.abs(a[1]!)];
  const phi = (a[2]! * Math.PI) / 180;
  if (!rx || !ry) return [to];
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (from.x - to.x) / 2;
  const dy = (from.y - to.y) / 2;
  const x1 = cos * dx + sin * dy;
  const y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const sign = a[3] === a[4] ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const coef = sign * Math.sqrt(Math.max(0, num / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from.x + to.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + to.y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!a[4] && dt > 0) dt -= 2 * Math.PI;
  if (a[4] && dt < 0) dt += 2 * Math.PI;
  const steps = Math.max(4, Math.ceil(Math.abs(dt) / (Math.PI / 16)));
  return Array.from({ length: steps }, (_, i) => {
    const t = t1 + (dt * (i + 1)) / steps;
    return { x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos };
  });
}

interface State { pen: Pt; start: Pt; ctrl: Pt | null; lines: Polyline[]; line: Pt[] }

function flushLine(s: State, closed: boolean): void {
  if (s.line.length > 1 || (s.line.length === 1 && closed)) s.lines.push({ points: s.line, closed });
  s.line = [];
}

function step(s: State, op: string, v: number[]): void {
  const rel = op === op.toLowerCase();
  const O = op.toUpperCase();
  const at = (x: number, y: number): Pt => (rel ? { x: s.pen.x + x, y: s.pen.y + y } : { x, y });
  const curve = (pts: Pt[]) => { for (let i = 1; i <= 12; i++) s.line.push(bezier(pts, i / 12)); };
  if (O === "M") { flushLine(s, false); s.pen = at(v[0]!, v[1]!); s.start = s.pen; s.line = [s.pen]; s.ctrl = null; return; }
  if (O === "Z") { flushLine(s, true); s.pen = s.start; s.line = [s.pen]; s.ctrl = null; return; }
  let next: Pt;
  let ctrl: Pt | null = null;
  if (O === "L") next = at(v[0]!, v[1]!);
  else if (O === "H") next = { x: rel ? s.pen.x + v[0]! : v[0]!, y: s.pen.y };
  else if (O === "V") next = { x: s.pen.x, y: rel ? s.pen.y + v[0]! : v[0]! };
  else if (O === "C") { const c1 = at(v[0]!, v[1]!); ctrl = at(v[2]!, v[3]!); next = at(v[4]!, v[5]!); curve([s.pen, c1, ctrl, next]); }
  else if (O === "S") { const c1 = s.ctrl ? { x: 2 * s.pen.x - s.ctrl.x, y: 2 * s.pen.y - s.ctrl.y } : s.pen; ctrl = at(v[0]!, v[1]!);
    next = at(v[2]!, v[3]!); curve([s.pen, c1, ctrl, next]); }
  else if (O === "Q") { ctrl = at(v[0]!, v[1]!); next = at(v[2]!, v[3]!); curve([s.pen, ctrl, next]); }
  else if (O === "T") { ctrl = s.ctrl ? { x: 2 * s.pen.x - s.ctrl.x, y: 2 * s.pen.y - s.ctrl.y } : s.pen; next = at(v[0]!, v[1]!); curve([s.pen, ctrl, next]); }
  else { next = at(v[5]!, v[6]!); s.line.push(...arcPoints(s.pen, v, next)); }
  if (O === "L" || O === "H" || O === "V") s.line.push(next);
  s.pen = next;
  s.ctrl = ctrl;
}

export function pathPolylines(d: string): Polyline[] {
  const s: State = { pen: { x: 0, y: 0 }, start: { x: 0, y: 0 }, ctrl: null, lines: [], line: [] };
  for (const cmd of tokenize(d)) {
    const arity = ARITY[cmd.op.toUpperCase()]!;
    if (!arity) { step(s, cmd.op, []); continue; }
    for (let i = 0; i + arity <= cmd.args.length; i += arity) {
      const op = i > 0 && cmd.op.toUpperCase() === "M" ? (cmd.op === "m" ? "l" : "L") : cmd.op;
      step(s, op, cmd.args.slice(i, i + arity));
    }
  }
  flushLine(s, false);
  return s.lines;
}

function truncate(line: Polyline, progress: number): Polyline {
  if (progress >= 1) return line;
  const pts = line.closed ? [...line.points, line.points[0]!] : line.points;
  const lengths = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y));
  let remaining = lengths.reduce((a, b) => a + b, 0) * Math.max(0, progress);
  const out = [pts[0]!];
  for (let i = 0; i < lengths.length && remaining > 0; i++) {
    const t = Math.min(1, remaining / (lengths[i]! || 1));
    out.push({ x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * t, y: pts[i]!.y + (pts[i + 1]!.y - pts[i]!.y) * t });
    remaining -= lengths[i]!;
  }
  return { points: out, closed: false };
}

/** Icon paths scaled by k and offset by pad, drawn up to progress (0..1) of each path's length. */
export function iconPolylines(paths: string[], k: number, pad: number, progress = 1): Polyline[] {
  return paths.flatMap(pathPolylines).map((line) => truncate({ closed: line.closed,
    points: line.points.map((p) => ({ x: p.x * k + pad, y: p.y * k + pad })) }, progress));
}
