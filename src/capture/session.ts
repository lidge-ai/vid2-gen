/**
 * Capture session format (<name>.vid2cap/): session.json + actions.jsonl (+ frames.jsonl for web/electron) + footage.mp4.
 * The session clock starts at t0 = {epochMs, monoNs}; action times are monotonic ms since t0 (structure/capture.md).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { parseFps, Vid2Error } from "../shared/index.ts";
import type { Fps } from "../shared/index.ts";

export const ACTION_KINDS = ["goto", "click", "type", "press", "scroll", "hover", "drag", "mark", "input"] as const;
const Point = z.strictObject({ x: z.number(), y: z.number() });
const Box = z.strictObject({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });

export const CaptureActionSchema = z.strictObject({
  id: z.string().min(1), seq: z.number().int().nonnegative(), kind: z.enum(ACTION_KINDS), label: z.string().optional(),
  tMs: z.number().nonnegative(), endMs: z.number().nonnegative().optional(), frame: z.number().int().nonnegative(),
  point: Point.optional(), bbox: Box.optional(), text: z.string().optional(), chars: z.number().int().nonnegative().optional(),
  key: z.string().optional(), source: z.enum(["agent", "hook"]),
});
export type CaptureAction = z.infer<typeof CaptureActionSchema>;

export const SessionMetaSchema = z.strictObject({
  version: z.literal(1), surface: z.enum(["web", "electron", "native", "terminal"]), fps: z.string(),
  width: z.number().int().positive(), height: z.number().int().positive(), scale: z.number().positive(),
  t0: z.strictObject({ epochMs: z.number(), monoNs: z.string() }), footage: z.string(), frames: z.string().nullable(),
  actions: z.string(), cursorHidden: z.boolean(), recordedText: z.boolean(),
  tool: z.strictObject({ vid2: z.string(), ffmpeg: z.string(), playwright: z.string().optional() }),
  platform: z.string(), createdAt: z.string(), warnings: z.array(z.string()).default([]),
});
export type SessionMeta = z.infer<typeof SessionMetaSchema>;
export type SessionClockOrigin = SessionMeta["t0"];

export interface LoadedSession { dir: string; meta: SessionMeta; actions: CaptureAction[]; fps: Fps; footagePath: string }

/** A session clock: t0 plus a monotonic "ms since t0" reader. */
export function createClock(): { t0: SessionClockOrigin; nowMs(): number } {
  const mono = process.hrtime.bigint();
  const t0 = { epochMs: Date.now(), monoNs: mono.toString() };
  return { t0, nowMs: () => Number(process.hrtime.bigint() - mono) / 1e6 };
}

/**
 * CDP screencast frame time on the session clock. metadata.timestamp is epoch seconds (same machine clock) but optional in the
 * protocol; without it the frame's receive time (already on the session clock) is used.
 */
export function cdpFrameMs(timestamp: number | undefined, t0: SessionClockOrigin, receivedMs: number): number {
  if (timestamp === undefined || !Number.isFinite(timestamp) || timestamp <= 0) return receivedMs;
  return Math.max(0, timestamp * 1000 - t0.epochMs);
}

/** Footage frame (CFR slot) of an instant; shared by the quantizer so events and frames agree. */
export function mapEventFrame(tMs: number, fps: Fps): number {
  return Math.max(0, Math.round((tMs / 1000) * fps.num / fps.den));
}

async function readJsonl<T>(path: string, schema: z.ZodType<T>): Promise<T[]> {
  let text: string;
  try { text = await readFile(path, "utf8"); } catch (cause) { throw new Vid2Error("E_NOT_FOUND", `cannot read ${path}`, { cause }); }
  return text.split(/\r?\n/).filter((l) => l.trim()).map((line, i) => {
    const parsed = schema.safeParse(JSON.parse(line));
    if (!parsed.success) throw new Vid2Error("E_SCHEMA", `invalid line ${i + 1} in ${path}`, { details: { issues: parsed.error.issues } });
    return parsed.data;
  });
}

export async function readSession(dir: string): Promise<LoadedSession> {
  let raw: unknown;
  try { raw = JSON.parse(await readFile(join(dir, "session.json"), "utf8")); }
  catch (cause) { throw new Vid2Error("E_NOT_FOUND", `not a capture session (missing session.json): ${dir}`, { cause, fix: "run vid2 capture first" }); }
  const parsed = SessionMetaSchema.safeParse(raw);
  if (!parsed.success) throw new Vid2Error("E_SCHEMA", `invalid session.json in ${dir}`, { details: { issues: parsed.error.issues } });
  const meta = parsed.data;
  const actions = await readJsonl(join(dir, meta.actions), CaptureActionSchema);
  return { dir, meta, actions: actions.sort((a, b) => a.seq - b.seq), fps: parseFps(meta.fps), footagePath: join(dir, meta.footage) };
}

export async function writeSession(dir: string, meta: SessionMeta, actions: CaptureAction[]): Promise<void> {
  await mkdir(dir, { recursive: true });
  const checked = SessionMetaSchema.parse(meta);
  await writeFile(join(dir, checked.actions), actions.map((a) => JSON.stringify(CaptureActionSchema.parse(a))).join("\n") + (actions.length ? "\n" : ""));
  await writeFile(join(dir, "session.json"), JSON.stringify(checked, null, 2) + "\n");
}

/** Find an action by label, id, or "<kind>#<k>" (k is 1-based within that kind). */
export function findAction(actions: CaptureAction[], event: string): CaptureAction | undefined {
  const byKind = /^([a-z]+)#(\d+)$/.exec(event);
  if (byKind) return actions.filter((a) => a.kind === byKind[1]).at(Number(byKind[2]) - 1);
  return actions.find((a) => a.label === event) ?? actions.find((a) => a.id === event);
}
