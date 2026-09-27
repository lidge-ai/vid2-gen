import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Vid2Error } from "../shared/index.ts";
import type { CaptureAction, SessionClockOrigin } from "./session.ts";

type HookEvent = { x?: number; y?: number; keycode?: number; button?: number };
export interface InputHook {
  on(name: string, callback: (event: HookEvent) => void): void;
  start(): void;
  stop(): void;
  removeAllListeners?(name: string): void;
}
export type HookAction = Omit<CaptureAction, "id" | "seq" | "frame">;

/** Optional native module: installing vid2 never installs or executes this hook. */
export async function loadHook(importer?: () => Promise<unknown>): Promise<InputHook | null> {
  try {
    const moduleName = "uiohook-napi";
    const module: unknown = await (importer ? importer() : import(moduleName));
    const exports = module as { uIOhook?: unknown; default?: unknown };
    const candidate = exports.uIOhook ?? exports.default;
    if (!candidate || typeof candidate !== "object") return null;
    const hook = candidate as Partial<InputHook>;
    return typeof hook.on === "function" && typeof hook.start === "function" && typeof hook.stop === "function"
      ? hook as InputHook : null;
  } catch { return null; }
}

export interface HookOptions {
  nowMs(): number;
  scale: number;
  origin: { x: number; y: number };
  onAction(action: HookAction): void;
  loader?: () => Promise<InputHook | null>;
}

/** Record key codes only; mouse moves are limited to 60 Hz on the session clock. */
export async function startInputHook(opts: HookOptions): Promise<{ stop(): void; warnings: string[] }> {
  const hook = await (opts.loader ? opts.loader() : loadHook());
  if (!hook) return { stop() {}, warnings: ["Input hook unavailable; external marks still work."] };
  const pressed = new Set<number>();
  let lastMove = -Infinity;
  const point = (event: HookEvent): { x: number; y: number } | undefined =>
    event.x === undefined || event.y === undefined ? undefined :
      { x: Math.round((event.x - opts.origin.x) * opts.scale), y: Math.round((event.y - opts.origin.y) * opts.scale) };
  const emit = (kind: HookAction["kind"], event: HookEvent, label?: string): void => {
    const p = point(event);
    opts.onAction({ kind, source: "hook", tMs: opts.nowMs(), ...(label ? { label } : {}), ...(p ? { point: p } : {}),
      ...(event.keycode === undefined ? {} : { key: String(event.keycode) }) });
  };
  hook.on("mousemove", (event) => {
    const now = opts.nowMs();
    if (now - lastMove < 1000 / 60) return;
    lastMove = now; emit("input", event, "mousemove");
  });
  hook.on("mousedown", (event) => emit("click", event, "mousedown"));
  hook.on("mouseup", (event) => emit("input", event, "mouseup"));
  hook.on("keydown", (event) => {
    if (event.keycode === undefined) return;
    pressed.add(event.keycode);
    const ctrl = [29, 3613].some((code) => pressed.has(code));
    const alt = [56, 3640].some((code) => pressed.has(code));
    if (ctrl && alt && [50, 77].includes(event.keycode)) emit("mark", event, "mark");
    else emit("press", event);
  });
  hook.on("keyup", (event) => { if (event.keycode !== undefined) pressed.delete(event.keycode); });
  try { hook.start(); }
  catch {
    for (const name of ["mousemove", "mousedown", "mouseup", "keydown", "keyup"]) hook.removeAllListeners?.(name);
    return { stop() {}, warnings: ["Input hook could not start; grant Accessibility/Input Monitoring if events are needed. External marks still work."] };
  }
  return { stop() { hook.stop(); for (const name of ["mousemove", "mousedown", "mouseup", "keydown", "keyup"]) hook.removeAllListeners?.(name); }, warnings: [] };
}

export async function appendMark(sessionDir: string, label: string): Promise<void> {
  if (!label.trim()) throw new Vid2Error("E_INPUT", "mark label cannot be empty");
  await appendFile(join(sessionDir, "marks.jsonl"), JSON.stringify({ label, epochMs: Date.now() }) + "\n");
}

/** Watches marks written by another vid2 process; stop() drains the final append. */
export function tailMarks(sessionDir: string, t0: SessionClockOrigin, onMark: (action: HookAction) => void): { flush(): Promise<void>; stop(): Promise<void> } {
  let readBytes = 0;
  let pending = "";
  let busy = false;
  async function flush(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      let bytes: Buffer;
      try { bytes = await readFile(join(sessionDir, "marks.jsonl")); } catch { return; }
      const next = bytes.subarray(readBytes).toString("utf8");
      readBytes = bytes.length;
      const lines = (pending + next).split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        try {
          const mark = JSON.parse(line) as { label?: unknown; epochMs?: unknown };
          if (typeof mark.label === "string" && typeof mark.epochMs === "number") onMark({
            kind: "mark", label: mark.label, tMs: Math.max(0, mark.epochMs - t0.epochMs), source: "agent",
          });
        } catch { /* ignore a malformed external mark */ }
      }
    } finally { busy = false; }
  }
  const timer = setInterval(() => { void flush().catch(() => {}); }, 100);
  return { flush, async stop() { clearInterval(timer); await flush(); } };
}
