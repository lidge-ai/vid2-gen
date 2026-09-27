/** Experimental Electron capture through Playwright's Electron driver and CDP screencast. */
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Electron, ElectronApplication, Locator, Page } from "playwright-core";
import { fpsString, packageVersion, parseFps, Vid2Error } from "../shared/index.ts";
import { findExecutable, locateTools } from "../probe/index.ts";
import { finalizeFrames, jpegDimensions } from "./quantize.ts";
import { createClock, readSession, writeSession } from "./session.ts";
import type { LoadedSession, SessionMeta } from "./session.ts";
import { StepsSchema } from "./steps.ts";
import type { Steps } from "./steps.ts";
import { createActionRecorder, runSteps, startScreencast } from "./web.ts";
import type { ActionRecorder, ScriptHelpers } from "./web.ts";

export interface ElectronCaptureOptions { app: string; args?: string[]; steps?: Steps | string; script?: string;
  fps: number | string; out: string; recordText: boolean }
export interface ElectronCaptureResult { dir: string; session: LoadedSession; warnings: string[] }

function isMainScript(path: string): boolean { return [".js", ".cjs", ".mjs"].includes(extname(path).toLowerCase()); }

/** A main JS file uses an installed Electron executable; a packaged app supplies its own. */
export function electronLaunch(opts: Pick<ElectronCaptureOptions, "app" | "args">,
  path = process.env["PATH"] ?? ""): { executablePath: string; args: string[] } {
  const app = resolve(opts.app);
  if (!existsSync(app)) throw new Vid2Error("E_NOT_FOUND", `Electron app not found: ${opts.app}`);
  const args = [...(opts.args ?? [])];
  if (isMainScript(app)) {
    const binary = process.env["VID2_ELECTRON"] ? findExecutable(process.env["VID2_ELECTRON"], path) : findExecutable("electron", path);
    if (!binary) throw new Vid2Error("E_CAPABILITY", "Electron capture needs an Electron executable", {
      fix: "Install Electron or set VID2_ELECTRON to its executable path." });
    return { executablePath: binary, args: [app, ...args] };
  }
  if (app.endsWith(".app")) {
    const macos = join(app, "Contents/MacOS");
    const candidates = existsSync(macos) ? readdirSync(macos).filter(name => name === basename(app, ".app")) : [];
    const binary = candidates[0] ? join(macos, candidates[0]) : undefined;
    if (!binary) throw new Vid2Error("E_NOT_FOUND", `Electron app has no executable in Contents/MacOS: ${opts.app}`);
    return { executablePath: binary, args };
  }
  const binary = findExecutable(app, path);
  if (!binary) throw new Vid2Error("E_NOT_FOUND", `Electron executable is not runnable: ${opts.app}`);
  return { executablePath: binary, args };
}

async function stepsFrom(input: Steps | string | undefined): Promise<Steps | undefined> {
  if (input === undefined) return undefined;
  if (typeof input !== "string") return StepsSchema.parse(input);
  let value: unknown;
  try { value = JSON.parse(await readFile(resolve(input), "utf8")); }
  catch (cause) { throw new Vid2Error("E_INPUT", `cannot read Electron steps: ${input}`, { cause }); }
  const parsed = StepsSchema.safeParse(value);
  if (!parsed.success) throw new Vid2Error("E_SCHEMA", `invalid Electron steps: ${input}`, { details: { issues: parsed.error.issues } });
  return parsed.data;
}

async function runElectronScript(page: Page, path: string, recorder: ActionRecorder): Promise<void> {
  const module = await import(pathToFileURL(resolve(path)).href) as { default?: (helpers: ScriptHelpers) => Promise<void> };
  if (typeof module.default !== "function") throw new Vid2Error("E_INPUT", "Electron capture script needs an async default export");
  const locator = (value: string | Locator): Locator => typeof value === "string" ? page.locator(value) : value;
  const helpers: ScriptHelpers = { page,
    async click(target, opts) { const loc = locator(target); await recorder.action("click", { locator: loc,
      ...(opts?.label ? { label: opts.label } : {}) }, () => loc.click()); },
    async type(target, text, opts) { const loc = locator(target); await recorder.action("type", { locator: loc, text,
      ...(opts?.label ? { label: opts.label } : {}) }, () => loc.pressSequentially(text, { delay: opts?.delayMs ?? 0 })); },
    async press(key) { await recorder.action("press", { key }, () => page.keyboard.press(key)); },
    mark: (label) => recorder.mark(label), wait: (ms) => page.waitForTimeout(ms) };
  await module.default(helpers);
}

async function loadPlaywright(): Promise<{ _electron: Electron }> {
  try { return await import("playwright-core"); }
  catch (cause) { throw new Vid2Error("E_CAPABILITY", "Electron capture needs playwright-core", {
    cause, fix: "Install playwright-core alongside vid2-gen." }); }
}

/** Launch Electron, record its first window, and quantize CDP frames to the session FPS. */
export async function captureElectron(opts: ElectronCaptureOptions): Promise<ElectronCaptureResult> {
  if (Boolean(opts.steps) === Boolean(opts.script)) throw new Vid2Error("E_INPUT", "choose exactly one of steps or script");
  const fps = parseFps(opts.fps);
  const launch = electronLaunch(opts);
  const steps = await stepsFrom(opts.steps);
  const pw = await loadPlaywright();
  const tools = locateTools();
  const dir = resolve(opts.out);
  let app: ElectronApplication | undefined;
  try {
    try { app = await pw._electron.launch(launch); }
    catch (cause) { throw new Vid2Error("E_CAPABILITY", `could not launch Electron app: ${opts.app}`, { cause }); }
    const page = await app.firstWindow();
    const cdp = await page.context().newCDPSession(page);
    const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 80 });
    const geometry = jpegDimensions(Buffer.from(shot.data, "base64"));
    const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    const scale = geometry.width / viewport.width;
    await mkdir(dir, { recursive: true });
    const clock = createClock();
    const recorder = createActionRecorder(() => clock.nowMs(), scale, opts.recordText);
    const cast = await startScreencast(cdp, { dir, t0: clock.t0, nowMs: () => clock.nowMs(),
      width: geometry.width, height: geometry.height, scale: 1 });
    try {
      if (steps) await runSteps(page, steps, recorder);
      else await runElectronScript(page, opts.script!, recorder);
      await page.waitForTimeout(250);
    } finally { await cast.stop(); }
    const encoded = await finalizeFrames({ dir, frames: cast.frames, actions: recorder.actions,
      fps, endMs: clock.nowMs(), ffmpeg: tools.ffmpeg });
    const meta: SessionMeta = { version: 1, surface: "electron", fps: fpsString(fps), width: encoded.width, height: encoded.height,
      scale, t0: clock.t0, footage: "footage.mp4", frames: "frames.jsonl", actions: "actions.jsonl", cursorHidden: true,
      recordedText: opts.recordText, tool: { vid2: packageVersion(), ffmpeg: tools.ffmpeg, playwright: "electron" },
      platform: process.platform, createdAt: new Date().toISOString(), warnings: ["Electron capture is experimental."] };
    await writeSession(dir, meta, encoded.actions);
    return { dir, session: await readSession(dir), warnings: meta.warnings };
  } finally { if (app) await app.close(); }
}
