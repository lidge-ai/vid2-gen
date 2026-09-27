/**
 * FFmpeg filtergraph escaping (ffmpeg-filters "Notes on filtergraph escaping").
 * Level 1 escapes an option value (\ ' :). Level 2 escapes the result for the graph description (\ ' [ ] , ;).
 */

const LEVEL1 = /[\\':]/g;
const LEVEL2 = /[\\'[\],;]/g;

/** Escape a literal option value (text, file name) for use inside a filtergraph string. */
export function escapeValue(v: string | number): string {
  return String(v).replace(LEVEL1, (c) => "\\" + c).replace(LEVEL2, (c) => "\\" + c);
}

/** Normalize a filesystem path to forward slashes, then escape it (a drive colon becomes C\\\:). */
export function escapePath(p: string): string {
  return escapeValue(p.replace(/\\/g, "/"));
}

/**
 * Quote an expression (it may contain commas) so the graph parser passes it through intact.
 * A quote inside is closed, escaped and reopened.
 */
export function quoteExpr(e: string | number): string {
  return "'" + String(e).replace(/'/g, "'\\''") + "'";
}

/** Format a number for filter options: finite, no exponent, at most 6 decimals. */
export function num(v: number): string {
  if (!Number.isFinite(v)) throw new RangeError(`non-finite filter number: ${v}`);
  const r = Math.round(v * 1e6) / 1e6;
  if (Object.is(r, -0) || r === 0) return "0";
  return Math.abs(r) < 1e-6 ? "0" : r.toFixed(6).replace(/\.?0+$/, "");
}
