/** Experimental terminal capture from VHS tapes or asciinema v2 casts. */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseFps, fpsString, packageVersion, runChecked, Vid2Error } from "../shared/index.ts";
import type { Fps } from "../shared/index.ts";
import { findExecutable, locateTools, probeFfmpeg, probeMedia } from "../probe/index.ts";
import { createClock, mapEventFrame, readSession, writeSession } from "./session.ts";
import type { CaptureAction, LoadedSession, SessionMeta } from "./session.ts";

export interface TerminalCaptureOptions { tape?: string; cast?: string; fps: number | string; out: string }
export interface CastData { width: number; height: number; actions: CaptureAction[] }

function durationMs(value: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s)?$/i.exec(value.trim());
  if (!match) throw new Vid2Error("E_SCHEMA", `invalid tape duration: ${value}`);
  return Number(match[1]) * (match[2]?.toLowerCase() === "s" ? 1000 : 1);
}

function quoted(value: string): string {
  const source = value.trim();
  if (source.startsWith('"')) {
    try { return JSON.parse(source) as string; }
    catch { throw new Vid2Error("E_SCHEMA", "invalid quoted Type command in tape"); }
  }
  return source;
}

/** Reconstruct dispatch times; typed content is never copied into the action log. */
export function parseTape(tape: string, fps: Fps): CaptureAction[] {
  const actions: CaptureAction[] = [];
  let clock = 0;
  let typingMs = 50;
  let typeCount = 0;
  let enterCount = 0;
  for (const raw of tape.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const speed = /^Set\s+TypingSpeed\s+(.+)$/i.exec(line);
    if (speed) { typingMs = durationMs(speed[1]!); continue; }
    const sleep = /^Sleep\s+(.+)$/i.exec(line);
    if (sleep) { clock += durationMs(sleep[1]!); continue; }
    const typed = /^Type\s+(.+)$/i.exec(line);
    if (typed) {
      const chars = [...quoted(typed[1]!)].length;
      const endMs = clock + chars * typingMs;
      actions.push({ id: `type#${++typeCount}`, seq: actions.length, kind: "type", tMs: clock,
        endMs, frame: mapEventFrame(clock, fps), chars, source: "agent" });
      clock = endMs;
      continue;
    }
    if (/^Enter(?:\s|$)/i.test(line)) {
      actions.push({ id: `press#${++enterCount}`, seq: actions.length, kind: "press", key: "Enter", tMs: clock,
        frame: mapEventFrame(clock, fps), source: "agent" });
    }
  }
  return actions;
}

function castAction(index: number, kind: CaptureAction["kind"], tMs: number, fps: Fps, chars: number, label?: string): CaptureAction {
  return { id: `${kind}#${index}`, seq: index - 1, kind, ...(label === undefined ? {} : { label }),
    tMs, frame: mapEventFrame(tMs, fps), chars, source: "hook" };
}

/** Asciinema v2 events carry absolute seconds. Prefer input events; otherwise summarize output bursts. */
export function parseCast(cast: string, fps: Fps): CastData {
  const lines = cast.split(/\r?\n/).filter(Boolean);
  let header: unknown;
  try { header = JSON.parse(lines[0] ?? ""); }
  catch (cause) { throw new Vid2Error("E_SCHEMA", "invalid asciinema cast header", { cause }); }
  const h = header as { version?: number; width?: number; height?: number };
  if (h.version !== 2 || !Number.isInteger(h.width) || !Number.isInteger(h.height) || !h.width || !h.height) {
    throw new Vid2Error("E_SCHEMA", "asciinema cast needs v2 header with width and height");
  }
  const inputs: CaptureAction[] = [];
  const outputs: { tMs: number; lastMs: number; chars: number }[] = [];
  for (const [index, line] of lines.slice(1).entries()) {
    let value: unknown;
    try { value = JSON.parse(line); }
    catch (cause) { throw new Vid2Error("E_SCHEMA", `invalid cast event line ${index + 2}`, { cause }); }
    if (!Array.isArray(value) || typeof value[0] !== "number" || value[0] < 0 || typeof value[1] !== "string" || typeof value[2] !== "string") {
      throw new Vid2Error("E_SCHEMA", `invalid cast event line ${index + 2}`);
    }
    const tMs = value[0] * 1000;
    const chars = [...value[2]].length;
    if (value[1] === "i") inputs.push(castAction(inputs.length + 1, "input", tMs, fps, chars));
    if (value[1] === "o") {
      const previous = outputs.at(-1);
      if (previous && tMs - previous.lastMs <= 150) { previous.chars += chars; previous.lastMs = tMs; }
      else outputs.push({ tMs, lastMs: tMs, chars });
    }
  }
  const actions = inputs.length ? inputs : outputs.map((burst, i) => castAction(i + 1, "mark", burst.tMs, fps, burst.chars, `output#${i + 1}`));
  return { width: h.width, height: h.height, actions };
}

export function requireTerminalTool(name: "vhs" | "agg", path = process.env["PATH"] ?? ""): string {
  const found = findExecutable(name, path);
  if (!found) throw new Vid2Error("E_CAPABILITY", `${name} is required for terminal capture`, {
    fix: name === "vhs" ? "Install VHS from charmbracelet/vhs and retry." : "Install agg from asciinema/agg and retry.",
  });
  return found;
}

function injectOutput(tape: string, output: string): string {
  const kept = tape.split(/\r?\n/).filter(line => !/^\s*Output\s+/i.test(line));
  return [...kept, `Output ${JSON.stringify(output)}`, ""].join("\n");
}

async function normalize(input: string, output: string, fps: Fps, ffmpeg: string): Promise<void> {
  await runChecked(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", input,
    "-vf", `fps=${fpsString(fps)},scale=w=trunc(iw/2)*2:h=trunc(ih/2)*2:out_range=tv`, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", output],
  { timeoutMs: 180_000 });
}

/** Produces a terminal session; callers provide exactly one tape or cast. */
export async function captureTerminal(opts: TerminalCaptureOptions): Promise<LoadedSession> {
  if (Boolean(opts.tape) === Boolean(opts.cast)) throw new Vid2Error("E_INPUT", "provide exactly one of tape or cast");
  const fps = parseFps(opts.fps);
  const source = resolve(opts.tape ?? opts.cast!);
  const tool = requireTerminalTool(opts.tape ? "vhs" : "agg");
  const ffmpeg = await probeFfmpeg();
  const paths = locateTools();
  const scratch = await mkdtemp(join(tmpdir(), "vid2-terminal-"));
  const clock = createClock();
  const out = resolve(opts.out);
  try {
    const content = await readFile(source, "utf8");
    const raw = join(scratch, opts.tape ? "raw.mp4" : "raw.gif");
    let actions: CaptureAction[];
    if (opts.tape) {
      actions = parseTape(content, fps);
      const tapePath = join(scratch, "capture.tape");
      await writeFile(tapePath, injectOutput(content, raw));
      await runChecked(tool, [tapePath], { cwd: dirname(source), timeoutMs: 180_000 });
    } else {
      actions = parseCast(content, fps).actions;
      await runChecked(tool, ["--fps-cap", String(fps.num / fps.den), source, raw], { timeoutMs: 180_000 });
    }
    await (await import("node:fs/promises")).mkdir(out, { recursive: true });
    const footage = join(out, "footage.mp4");
    await normalize(raw, footage, fps, paths.ffmpeg);
    const media = await probeMedia(footage);
    if (!media.width || !media.height) throw new Vid2Error("E_RENDER", "terminal footage has no video geometry");
    const meta: SessionMeta = { version: 1, surface: "terminal", fps: fpsString(fps), width: media.width, height: media.height,
      scale: 1, t0: clock.t0, footage: "footage.mp4", frames: null, actions: "actions.jsonl", cursorHidden: true,
      recordedText: false, tool: { vid2: packageVersion(), ffmpeg: ffmpeg.version }, platform: process.platform,
      createdAt: new Date().toISOString(), warnings: ["Terminal capture timing is reconstructed from tape or cast events."] };
    await writeSession(out, meta, actions);
    return readSession(out);
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
