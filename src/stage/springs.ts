/** Closed-form damped springs: position at time t for a unit step, so any frame is evaluated without integrating earlier ones. */
import type { SpringParams } from "./types.ts";

export const DEFAULT_SPRING: SpringParams = { stiffness: 170, damping: 22, mass: 1 };

/** Progress 0 → 1 of a spring released at rest from 0 toward 1, after t seconds. */
export function springValue(t: number, p: SpringParams = DEFAULT_SPRING): number {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(p.stiffness / p.mass);
  const zeta = p.damping / (2 * Math.sqrt(p.stiffness * p.mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
  }
  if (zeta === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const s = Math.sqrt(zeta * zeta - 1);
  const r1 = -w0 * (zeta - s);
  const r2 = -w0 * (zeta + s);
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}

/** Seconds until the spring stays within tolerance of 1 (scanned at 1 ms, capped at 10 s). */
export function settleTime(p: SpringParams = DEFAULT_SPRING, tolerance = 0.002): number {
  let last = 0;
  for (let ms = 1; ms <= 10000; ms++) if (Math.abs(1 - springValue(ms / 1000, p)) > tolerance) last = ms;
  return (last + 1) / 1000;
}
