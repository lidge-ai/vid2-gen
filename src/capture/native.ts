import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fpsString, packageVersion, parseFps, run, Vid2Error } from "../shared/index.ts";
import type { Fps, Logger, RunResult, Runner } from "../shared/index.ts";
import { locateTools, probeFfmpeg } from "../probe/index.ts";
import type { FfmpegInfo } from "../probe/index.ts";
import { escapeValue, num } from "../compile/escape.ts";
import { blackFootageWarning, classifyCaptureFailure, listDevices, listNativeWindows } from "./devices.ts";
import type { CaptureDeviceListing } from "./devices.ts";
import { startInputHook, tailMarks } from "./input-hook.ts";
import type { HookAction } from "./input-hook.ts";
import { createClock, mapEventFrame, readSession, writeSession } from "./session.ts";
import type { CaptureAction, LoadedSession, SessionMeta } from "./session.ts";

export interface NativeRegion { x: number; y: number; width: number; height: number }
export interface NativeCaptureOptions {
  display?: number;
  window?: string;
  region?: NativeRegion;
  fps: Fps | number | string;
  duration?: number;
  stopFile?: string;
  events: boolean;
  cursor: "show" | "hide";
  out: string;
  runner?: Runner;
  logger?: Logger;
  /** Test seam for cross-platform argument construction. */
  platform?: NodeJS.Platform;
  capabilities?: Pick<FfmpegInfo, "filters" | "major" | "minor" | "version">;
  env?: NodeJS.ProcessEnv;
}
export interface NativeCaptureResult { dir: string; session: LoadedSession; warnings: string[] }

type InputPlan = { args: string[]; backend: "avfoundation" | "gfxcapture" | "ddagrab" | "gdigrab" | "x11grab"; region?: NativeRegion };

function validatedRegion(region: NativeRegion | undefined): NativeRegion | undefined {
  if (!region) return undefined;
  if (![region.x, region.y, region.width, region.height].every(Number.isInteger) || region.width < 1 || region.height < 1) {
    throw new Vid2Error("E_INPUT", "region must have integer x,y and positive width,height");
  }
  return region;
}

/** Pure backend selection and shell-free ffmpeg input arguments. */
export function nativeInputArgs(opts: NativeCaptureOptions, devices: CaptureDeviceListing,
  caps: Pick<FfmpegInfo, "filters" | "major" | "minor">,
  platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): InputPlan {
  const fps = typeof opts.fps === "object" ? opts.fps : parseFps(opts.fps);
  const rate = fpsString(fps);
  const display = opts.display ?? 0;
  if (!Number.isInteger(display) || display < 0) throw new Vid2Error("E_INPUT", "display must be a nonnegative integer");
  const region = validatedRegion(opts.region);
  if (platform === "darwin") {
    const screen = devices.screens.find((item) => item.display === display);
    if (!screen) throw new Vid2Error("E_CAPABILITY", `Capture screen ${display} was not listed by avfoundation`, {
      fix: "Run vid2 capture devices and choose a listed display." });
    return { backend: "avfoundation", args: ["-f", "avfoundation", "-framerate", rate, "-capture_cursor", opts.cursor === "show" ? "1" : "0",
      "-pixel_format", "bgr0", "-i", `${screen.deviceIndex}:none`], ...(region ? { region } : {}) };
  }
  if (platform === "win32") {
    if (opts.window && (caps.major > 8 || caps.major === 8 && caps.minor >= 1) && caps.filters.has("gfxcapture")) {
      const source = `gfxcapture=window_title=${escapeValue(opts.window)}:monitor_idx=window:capture_cursor=${opts.cursor === "show" ? "1" : "0"}:max_framerate=${rate}`;
      return { backend: "gfxcapture", args: ["-f", "lavfi", "-i", `${source},hwdownload,format=bgra`], ...(region ? { region } : {}) };
    }
    if (!opts.window && caps.filters.has("ddagrab")) {
      const source = `ddagrab=output_idx=${num(display)}:framerate=${rate}:draw_mouse=${opts.cursor === "show" ? "1" : "0"}`;
      return { backend: "ddagrab", args: ["-f", "lavfi", "-i", `${source},hwdownload,format=bgra`], ...(region ? { region } : {}) };
    }
    return { backend: "gdigrab", args: ["-f", "gdigrab", "-framerate", rate, "-draw_mouse", opts.cursor === "show" ? "1" : "0",
      "-i", opts.window ? `title=${opts.window}` : "desktop"], ...(region ? { region } : {}) };
  }
  if (env["WAYLAND_DISPLAY"]) throw new Vid2Error("E_CAPABILITY", "Wayland capture is not supported by the stock FFmpeg backend", {
    fix: "Use an X11 session or capture a web surface with vid2 capture web." });
  if (opts.window) throw new Vid2Error("E_CAPABILITY", "Native window capture is not available on X11 in this version", {
    fix: "Capture the display or a region with x11grab." });
  const screen = devices.screens.find((item) => item.display === display);
  const area = region ?? screen;
  if (!area?.width || !area.height) throw new Vid2Error("E_CAPABILITY", `X11 display ${display} has no known geometry`, {
    fix: "Run vid2 capture devices or supply --region x,y,width,height." });
  const x = region?.x ?? screen?.x ?? 0; const y = region?.y ?? screen?.y ?? 0;
  const server = env["DISPLAY"] || ":0.0";
  return { backend: "x11grab", args: ["-f", "x11grab", "-framerate", rate, "-draw_mouse", opts.cursor === "show" ? "1" : "0",
    "-video_size", `${num(area.width)}x${num(area.height)}`, "-i", `${server}+${num(x)},${num(y)}`] };
}

async function displayScale(runner: Runner, platform: NodeJS.Platform): Promise<number> {
  if (platform !== "darwin") return 1;
  try {
    const result = await runner("system_profiler", ["SPDisplaysDataType", "-json"], { timeoutMs: 8_000 });
    const data = JSON.parse(result.stdout.toString("utf8")) as { SPDisplaysDataType?: { spdisplays_ndrvs?: Record<string, string>[] }[] };
    const display = data.SPDisplaysDataType?.[0]?.spdisplays_ndrvs?.[0];
    const physical = /^(\d+)\s*x\s*(\d+)/.exec(display?.["_spdisplays_pixels"] ?? "");
    const logical = /^(\d+)\s*x\s*(\d+)/.exec(display?.["_spdisplays_resolution"] ?? "");
    return physical && logical && Number(logical[1]) > 0 ? Number(physical[1]) / Number(logical[1]) : 1;
  } catch { return 1; }
}

async function windowRegion(pattern: string, runner: Runner, scale: number): Promise<NativeRegion> {
  let regex: RegExp;
  try { regex = new RegExp(pattern, "i"); } catch { throw new Vid2Error("E_INPUT", `invalid window title regex: ${pattern}`); }
  const windows = await listNativeWindows(runner, "darwin");
  const match = windows.find((item) => regex.test(item.name));
  if (!match) throw new Vid2Error("E_CAPABILITY", `No visible window matches ${pattern}`, {
    details: { windows: windows.map((item) => item.name) }, fix: "Run vid2 capture devices and use a listed window title." });
  return { x: Math.round(match.position[0] * scale), y: Math.round(match.position[1] * scale),
    width: Math.round(match.size[0] * scale), height: Math.round(match.size[1] * scale) };
}

function captureArgs(input: InputPlan, fps: Fps, raw: string, duration?: number): string[] {
  const filters: string[] = [];
  if (input.region) {
    const { width, height, x, y } = input.region;
    filters.push(`crop=${num(width)}:${num(height)}:${num(x)}:${num(y)}`);
  }
  filters.push("pad=ceil(iw/2)*2:ceil(ih/2)*2");
  return ["-hide_banner", "-loglevel", "error", ...input.args, ...(duration === undefined ? [] : ["-t", num(duration)]),
    "-vf", filters.join(","), "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-pix_fmt", "yuv420p", "-y", raw];
}

export function runNativeProcess(cmd: string, args: string[], stopFile?: string): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    const started = Date.now(); const child = spawn(cmd, args, { shell: false, windowsHide: true });
    let stderr = ""; const stdout: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString("utf8")).slice(-8000); });
    let sent = false;
    const stop = () => { if (sent) return; sent = true; if (child.stdin.writable) child.stdin.write("q\n"); };
    child.stdin.on("error", () => {});
    const timer = stopFile ? setInterval(() => { if (existsSync(stopFile)) stop(); }, 100) : undefined;
    process.on("SIGINT", stop);
    const cleanup = () => { if (timer) clearInterval(timer); process.off("SIGINT", stop); };
    child.on("error", (cause) => { cleanup(); reject(cause); });
    child.on("close", (code, signal) => { cleanup(); resolvePromise({ code, signal, stdout: Buffer.concat(stdout), stderr, ms: Date.now() - started }); });
  });
}

async function footageInfo(ffprobe: string, path: string, runner: Runner): Promise<{ width: number; height: number; frames: number }> {
  const result = await runner(ffprobe, ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
    "stream=width,height,nb_read_frames", "-of", "json", path], { timeoutMs: 60_000 });
  if (result.code !== 0) throw new Vid2Error("E_RENDER", "Could not inspect captured footage", { details: { stderrTail: result.stderr.slice(-1000) } });
  const data = JSON.parse(result.stdout.toString("utf8")) as { streams?: { width?: number; height?: number; nb_read_frames?: string }[] };
  const stream = data.streams?.[0];
  if (!stream?.width || !stream.height || !Number(stream.nb_read_frames)) throw new Vid2Error("E_RENDER", "Capture produced no video frames");
  return { width: stream.width, height: stream.height, frames: Number(stream.nb_read_frames) };
}

function finalizeActions(events: HookAction[], fps: Fps): CaptureAction[] {
  return events.sort((a, b) => a.tMs - b.tMs).map((event, index) => ({ ...event, id: `native-${index + 1}`,
    seq: index, frame: mapEventFrame(event.tMs, fps) }));
}

/** Native screen/window capture with optional hook events and external file marks. */
export async function captureNative(opts: NativeCaptureOptions): Promise<NativeCaptureResult> {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  if (opts.window && opts.display !== undefined) throw new Vid2Error("E_INPUT", "choose either display or window");
  if (opts.duration !== undefined && (!Number.isFinite(opts.duration) || opts.duration <= 0)) throw new Vid2Error("E_INPUT", "duration must be positive");
  const fps = typeof opts.fps === "object" ? opts.fps : parseFps(opts.fps);
  const runner = opts.runner ?? run;
  const { ffmpeg, ffprobe } = opts.runner ? { ffmpeg: "ffmpeg", ffprobe: "ffprobe" } : locateTools();
  const caps = opts.capabilities ?? (opts.runner ? { filters: new Set<string>(), major: 0, minor: 0, version: "test" } : await probeFfmpeg());
  const devices = await listDevices(runner, platform);
  const scale = await displayScale(runner, platform);
  const region = platform === "darwin" && opts.window ? await windowRegion(opts.window, runner, scale) : opts.region;
  const input = nativeInputArgs({ ...opts, ...(region ? { region } : {}) }, devices, caps, platform, env);
  const dir = resolve(opts.out); const raw = join(dir, "raw.mp4"); const footage = join(dir, "footage.mp4");
  await mkdir(dir, { recursive: true });
  const clock = createClock(); const events: HookAction[] = []; const warnings: string[] = [];
  const marks = tailMarks(dir, clock.t0, (action) => events.push(action));
  const hook = opts.events ? await startInputHook({ nowMs: () => clock.nowMs(), scale, origin: { x: (region?.x ?? 0) / scale,
    y: (region?.y ?? 0) / scale }, onAction: (action) => events.push(action) }) : null;
  if (hook) warnings.push(...hook.warnings);
  try {
    const args = captureArgs(input, fps, raw, opts.duration);
    opts.logger?.info(`capturing ${input.backend} to ${dir}`);
    let result: RunResult;
    try { result = opts.runner ? await runner(ffmpeg, args) : await runNativeProcess(ffmpeg, args, opts.stopFile); }
    catch (cause) { throw new Vid2Error("E_CAPABILITY", "Could not launch native capture", { cause }); }
    if (result.code !== 0) throw classifyCaptureFailure(result.stderr, platform);
  } finally { hook?.stop(); await marks.stop(); }
  const normalized = await runner(ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", raw,
    "-vf", `fps=${fpsString(fps)},scale=out_range=tv`, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", footage], { timeoutMs: 120_000 });
  if (normalized.code !== 0) throw new Vid2Error("E_RENDER", "Could not normalize native footage", {
    details: { stderrTail: normalized.stderr.slice(-1000) } });
  const info = await footageInfo(ffprobe, footage, runner);
  const black = await blackFootageWarning(footage, runner);
  if (black) warnings.push(black);
  const meta: SessionMeta = { version: 1, surface: "native", fps: fpsString(fps), width: info.width, height: info.height,
    scale, t0: clock.t0, footage: "footage.mp4", frames: null, actions: "actions.jsonl", cursorHidden: opts.cursor === "hide",
    recordedText: false, tool: { vid2: packageVersion(), ffmpeg: caps.version }, platform, createdAt: new Date().toISOString(), warnings };
  await writeSession(dir, meta, finalizeActions(events, fps));
  await unlink(raw).catch(() => {});
  return { dir, session: await readSession(dir), warnings };
}
