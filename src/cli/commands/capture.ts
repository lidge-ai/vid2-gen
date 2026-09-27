/** vid2 capture <web|electron|native|terminal|devices|inspect|mark>: record real product footage with an action log (030). */
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { appendMark, captureElectron, captureNative, captureTerminal, captureWeb, listDevices, readSession, StepsSchema } from "../../capture/index.ts";
import type { LoadedSession } from "../../capture/index.ts";
import { Vid2Error } from "../../shared/errors.ts";
import type { CommandResult } from "../output.ts";
import type { CommandSpec } from "../registry.ts";

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

const SUBCOMMANDS = "web | electron | native | terminal | devices | inspect <session> | mark <session> <label>";

export const capture: CommandSpec = {
  name: "capture",
  summary: "Record real product footage with an action log",
  usage: `vid2 capture <${SUBCOMMANDS}> [options] [--json]`,
  options: {
    steps: { type: "string", description: "web/electron: declarative steps JSON (vid2 schema --steps)" },
    script: { type: "string", description: "web/electron: JS module exporting default async (v2) => {}" },
    url: { type: "string", description: "web: start URL" },
    serve: { type: "string", description: "web: serve this directory on 127.0.0.1 for the capture" },
    size: { type: "string", description: "web: viewport, e.g. 1440x900" },
    scale: { type: "string", description: "web: device scale factor (default 2)" },
    fps: { type: "string", description: "footage frame rate (default 30)" },
    out: { type: "string", short: "o", description: "session directory (<name>.vid2cap)" },
    "record-text": { type: "boolean", description: "store typed text in actions.jsonl (redacted by default)" },
    headed: { type: "boolean", description: "web: show the browser" },
    browser: { type: "string", description: "web: chromium | chrome | msedge" },
    app: { type: "string", description: "electron: app executable or main.js" },
    display: { type: "string", description: "native: screen number (see capture devices)" },
    window: { type: "string", description: "native: window title regex" },
    region: { type: "string", description: "native: x,y,width,height" },
    duration: { type: "string", description: "native: seconds to record" },
    "stop-file": { type: "string", description: "native: stop when this file appears" },
    events: { type: "boolean", description: "native: log global input (needs uiohook-napi installed separately)" },
    cursor: { type: "string", description: "native: show | hide the OS cursor (default hide)" },
    tape: { type: "string", description: "terminal: VHS tape" },
    cast: { type: "string", description: "terminal: asciinema cast" },
  },
  async run({ args, values, cwd }) {
    const [sub, ...rest] = args;
    switch (sub) {
      case "web": return web(values, cwd);
      case "electron": return electron(values, cwd);
      case "native": return native(values, cwd);
      case "terminal": return terminal(values, cwd);
      case "devices": return { command: "capture devices", data: { ...(await listDevices()) } };
      case "inspect": return inspect(rest, cwd);
      case "mark": {
        if (rest.length !== 2) throw new Vid2Error("E_INPUT", "capture mark needs <session> <label>");
        await appendMark(resolve(cwd, rest[0]!), rest[1]!);
        return { command: "capture mark", data: { session: resolve(cwd, rest[0]!), label: rest[1] } };
      }
      default: throw new Vid2Error("E_INPUT", `capture needs a subcommand: ${SUBCOMMANDS}`);
    }
  },
};
