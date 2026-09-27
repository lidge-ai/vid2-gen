/** Authored primitives shared by the timeline and stage schemas (kept separate to avoid an import cycle). */
import { z } from "zod";

export const TimeLiteral = z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?(s|ms|f|b)$/)]);
export const Color = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
export const Span = { start: TimeLiteral.default(0), end: TimeLiteral.optional() };
