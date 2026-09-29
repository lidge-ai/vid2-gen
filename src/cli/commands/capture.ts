/** vid2 capture <web|electron|native|terminal|devices|inspect|mark>: record real product footage with an action log (030). */
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { appendMark, captureElectron, captureNative, captureTerminal, captureWeb, listDevices, readSession, StepsSchema } from "../../capture/index.ts";
import type { LoadedSession } from "../../capture/index.ts";
import { Vid2Error } from "../../shared/errors.ts";
import type { CommandResult } from "../output.ts";
import type { CommandOption, CommandSpec } from "../registry.ts";
import { parentCommand } from "../tree.ts";

type Values = Record<string, unknown>;
const str = (v: Values, k: string): string | undefined => (typeof v[k] === "string" ? (v[k]) : undefined);

function size(value: string | undefined): { width: number; height: number } {
  const m = /^(\d+)x(\d+)$/.exec(value ?? "1440x900");
  if (!m) throw new Vid2Error("E_INPUT", "--size must look like 1440x900");
  return { width: Number(m[1]), height: Number(m[2]) };
}

function numberOpt(v: Values, k: string): number | undefined {
  const s = str(v, k);
  if (s === undefined) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new Vid2Error("E_INPUT", `--${k} must be a non-negative number`);
  return n;
}

async function loadSteps(file: string | undefined, cwd: string) {
  if (!file) return undefined;
  const parsed = StepsSchema.safeParse(JSON.parse(await readFile(resolve(cwd, file), "utf8")));
  if (!parsed.success) throw new Vid2Error("E_SCHEMA", "invalid steps file", { details: { issues: parsed.error.issues }, fix: "vid2 schema --steps --json" });
  return parsed.data;
}

function out(v: Values, cwd: string, fallback: string): string {
  const name = str(v, "out") ?? fallback;
  return resolve(cwd, name.endsWith(".vid2cap") ? name : `${name}.vid2cap`);
}

function summary(command: string, session: LoadedSession, warnings: string[]): CommandResult {
  const m = session.meta;
  return { command, artifacts: [session.dir, session.footagePath], warnings: [...warnings, ...m.warnings],
    data: { session: session.dir, surface: m.surface, fps: m.fps, width: m.width, height: m.height, footage: session.footagePath,
      recordedText: m.recordedText, actions: session.actions.map((a) => ({ id: a.id, kind: a.kind, label: a.label, frame: a.frame, tMs: a.tMs })) } };
}

async function web(v: Values, cwd: string): Promise<CommandResult> {
  const { width, height } = size(str(v, "size"));
  const steps = await loadSteps(str(v, "steps"), cwd);
  const script = str(v, "script");
  const url = str(v, "url");
  const serve = str(v, "serve");
  const browser = str(v, "browser");
  if (browser && !["chromium", "chrome", "msedge"].includes(browser)) throw new Vid2Error("E_INPUT", "--browser must be chromium, chrome or msedge");
  const r = await captureWeb({ width, height, scale: numberOpt(v, "scale") ?? 2, fps: str(v, "fps") ?? "30", out: out(v, cwd, "web"),
    recordText: v["record-text"] === true, headed: v["headed"] === true, ...(steps ? { steps } : {}),
    ...(script ? { script: resolve(cwd, script) } : {}), ...(url ? { url } : {}), ...(serve ? { serve: resolve(cwd, serve) } : {}),
    ...(browser ? { browser: browser as "chromium" | "chrome" | "msedge" } : {}) });
  return summary("capture web", r.session, r.warnings);
}

async function electron(v: Values, cwd: string): Promise<CommandResult> {
  const app = str(v, "app");
  if (!app) throw new Vid2Error("E_INPUT", "capture electron needs --app <path>");
  const steps = await loadSteps(str(v, "steps"), cwd);
  const script = str(v, "script");
  const r = await captureElectron({ app: resolve(cwd, app), fps: str(v, "fps") ?? "30", out: out(v, cwd, "electron"),
    recordText: v["record-text"] === true, ...(steps ? { steps } : {}), ...(script ? { script: resolve(cwd, script) } : {}) });
  return summary("capture electron", r.session, r.warnings);
}

function region(value: string | undefined) {
  if (!value) return undefined;
  const p = value.split(",").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0)) throw new Vid2Error("E_INPUT", "--region must be x,y,width,height");
  return { x: p[0]!, y: p[1]!, width: p[2]!, height: p[3]! };
}

async function native(v: Values, cwd: string): Promise<CommandResult> {
  const cursor = str(v, "cursor") ?? "hide";
  if (cursor !== "show" && cursor !== "hide") throw new Vid2Error("E_INPUT", "--cursor must be show or hide");
  const display = numberOpt(v, "display"), duration = numberOpt(v, "duration");
  const win = str(v, "window"), stop = str(v, "stop-file"), reg = region(str(v, "region"));
  const r = await captureNative({ fps: str(v, "fps") ?? "30", events: v["events"] === true, cursor, out: out(v, cwd, "native"),
    ...(display === undefined ? {} : { display }), ...(duration === undefined ? {} : { duration }), ...(win ? { window: win } : {}),
    ...(stop ? { stopFile: resolve(cwd, stop) } : {}), ...(reg ? { region: reg } : {}) });
  return summary("capture native", r.session, r.warnings);
}

async function terminal(v: Values, cwd: string): Promise<CommandResult> {
  const tape = str(v, "tape"), cast = str(v, "cast");
  if (!!tape === !!cast) throw new Vid2Error("E_INPUT", "capture terminal needs exactly one of --tape or --cast");
  const session = await captureTerminal({ fps: str(v, "fps") ?? "30", out: out(v, cwd, basename(tape ?? cast!).replace(/\.\w+$/, "")),
    ...(tape ? { tape: resolve(cwd, tape) } : {}), ...(cast ? { cast: resolve(cwd, cast) } : {}) });
  return summary("capture terminal", session, []);
}

async function inspect(args: string[], cwd: string): Promise<CommandResult> {
  if (!args[0]) throw new Vid2Error("E_INPUT", "capture inspect needs a session directory");
  const session = await readSession(resolve(cwd, args[0]));
  const result = summary("capture inspect", session, []);
  if (session.meta.recordedText) result.warnings = [...(result.warnings ?? []), "this session contains recorded typed text; review actions.jsonl before sharing it"];
  return result;
}

const FPS: CommandOption = { type: "string", value: "<fps>", description: "Footage frame rate", default: "30" };
const OUT: CommandOption = { type: "string", short: "o", value: "<name>", description: "Session directory (.vid2cap is appended)" };
const RECORD_TEXT: CommandOption = { type: "boolean", description: "Store typed text in actions.jsonl (redacted by default)" };
const STEPS: CommandOption = { type: "string", value: "<steps.json>", description: "Declarative steps (schema: vid2 schema --steps)" };
const SCRIPT: CommandOption = { type: "string", value: "<module.mjs>", description: "JS module exporting default async (v2) => {}" };

const webSpec: CommandSpec = {
  name: "web", summary: "Record a web page in Chromium with Playwright, with an action log",
  usage: "vid2 capture web (--url <url> | --serve <dir>) [--steps s.json | --script s.mjs] [options] [--json]",
  options: {
    url: { type: "string", value: "<url>", description: "Start URL" },
    serve: { type: "string", value: "<dir>", description: "Serve this directory on 127.0.0.1 for the capture" },
    steps: STEPS, script: SCRIPT,
    size: { type: "string", value: "<WxH>", description: "Viewport", default: "1440x900" },
    scale: { type: "string", value: "<n>", description: "Device scale factor", default: "2" },
    fps: FPS, out: { ...OUT, default: "web" }, "record-text": RECORD_TEXT,
    headed: { type: "boolean", description: "Show the browser window" },
    browser: { type: "string", value: "<chromium|chrome|msedge>", description: "Browser channel", default: "chromium" },
  },
  examples: ["vid2 capture web --serve site --steps app.steps.json --size 1280x720 --scale 1.5 --out app"],
  run({ args, values, cwd }) { none("web", args); return web(values, cwd); },
};

const electronSpec: CommandSpec = {
  name: "electron", summary: "Record an Electron app window with an action log",
  usage: "vid2 capture electron --app <path> [--steps s.json | --script s.mjs] [options] [--json]",
  options: { app: { type: "string", value: "<path>", description: "App executable or main.js (required)" }, steps: STEPS, script: SCRIPT,
    fps: FPS, out: { ...OUT, default: "electron" }, "record-text": RECORD_TEXT },
  examples: ["vid2 capture electron --app ./main.js --steps demo.steps.json --out demo"],
  run({ args, values, cwd }) { none("electron", args); return electron(values, cwd); },
};

const nativeSpec: CommandSpec = {
  name: "native", summary: "Record the screen, a window or a region with the OS recorder",
  usage: "vid2 capture native [--display N | --window regex | --region x,y,w,h] (--duration S | --stop-file f) [options] [--json]",
  options: {
    display: { type: "string", value: "<n>", description: "Screen number (see vid2 capture devices)" },
    window: { type: "string", value: "<regex>", description: "Window title to crop to" },
    region: { type: "string", value: "<x,y,w,h>", description: "Screen region in pixels" },
    duration: { type: "string", value: "<seconds>", description: "Seconds to record" },
    "stop-file": { type: "string", value: "<file>", description: "Stop when this file appears" },
    events: { type: "boolean", description: "Log global input (needs uiohook-napi installed separately)" },
    cursor: { type: "string", value: "<show|hide>", description: "OS cursor in the footage", default: "hide" },
    fps: FPS, out: { ...OUT, default: "native" },
  },
  examples: ["vid2 capture native --display 1 --duration 12 --out screen"],
  run({ args, values, cwd }) { none("native", args); return native(values, cwd); },
};

const terminalSpec: CommandSpec = {
  name: "terminal", summary: "Turn a VHS tape or an asciinema cast into a capture session",
  usage: "vid2 capture terminal (--tape t.tape | --cast c.cast) [--fps 30] [-o name] [--json]",
  options: { tape: { type: "string", value: "<file.tape>", description: "VHS tape to record" },
    cast: { type: "string", value: "<file.cast>", description: "asciinema cast to render" }, fps: FPS,
    out: { ...OUT, default: "<tape or cast name>" } },
  examples: ["vid2 capture terminal --tape demo.tape"],
  run({ args, values, cwd }) { none("terminal", args); return terminal(values, cwd); },
};

const devicesSpec: CommandSpec = {
  name: "devices", summary: "List screens and windows the native recorder can see",
  usage: "vid2 capture devices [--json]", options: {}, examples: ["vid2 capture devices --json"],
  async run({ args }) { none("devices", args); return { command: "capture devices", data: { ...(await listDevices()) } }; },
};

const inspectSpec: CommandSpec = {
  name: "inspect", summary: "Summarize a capture session: footage, size and actions",
  usage: "vid2 capture inspect <session.vid2cap> [--json]", options: {}, examples: ["vid2 capture inspect app.vid2cap --json"],
  run({ args, cwd }) {
    if (args.length !== 1) return Promise.reject(new Vid2Error("E_INPUT", "capture inspect needs one session directory"));
    return inspect(args, cwd);
  },
};

const markSpec: CommandSpec = {
  name: "mark", summary: "Append a named marker to a session's action log",
  usage: "vid2 capture mark <session.vid2cap> <label> [--json]", options: {}, examples: ['vid2 capture mark app.vid2cap "export done"'],
  async run({ args, cwd }) {
    if (args.length !== 2) throw new Vid2Error("E_INPUT", "capture mark needs <session> <label>");
    await appendMark(resolve(cwd, args[0]!), args[1]!);
    return { command: "capture mark", data: { session: resolve(cwd, args[0]!), label: args[1] } };
  },
};

function none(name: string, args: string[]): void {
  if (args.length) throw new Vid2Error("E_INPUT", `capture ${name} takes no positional arguments`, { fix: `run vid2 capture ${name} --help` });
}

export const capture = parentCommand({
  name: "capture", group: "media",
  summary: "Record real product footage with an action log",
  usage: "vid2 capture <web|electron|native|terminal|devices|inspect|mark> [options] [--json]",
  description: "A session (<name>.vid2cap) holds footage.mp4, frame times and actions.jsonl, so a timeline can cut on a click or a typed field.",
  options: {},
  subcommands: [webSpec, electronSpec, nativeSpec, terminalSpec, devicesSpec, inspectSpec, markSpec],
  examples: ["vid2 capture web --url https://example.com --steps steps.json --out demo", "vid2 capture inspect demo.vid2cap"],
});
