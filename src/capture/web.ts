import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser, BrowserContext, CDPSession, Locator, Page, chromium as ChromiumType } from "playwright-core";
import { StepsSchema } from "./steps.ts";
import type { Steps } from "./steps.ts";
import { createClock, cdpFrameMs, readSession, writeSession } from "./session.ts";
import type { CaptureAction, LoadedSession, SessionClockOrigin, SessionMeta } from "./session.ts";
import { finalizeFrames, jpegDimensions } from "./quantize.ts";
import type { CapturedFrame } from "./quantize.ts";
import { serveDir } from "./serve.ts";
import { locateTools, probeFfmpeg } from "../probe/index.ts";
import { fpsString, packageVersion, parseFps, Vid2Error } from "../shared/index.ts";
import type { Fps } from "../shared/index.ts";

type PendingAction = Omit<CaptureAction, "frame"> & { frame?: number };
type Box = NonNullable<CaptureAction["bbox"]>;
type PlaywrightModule = { chromium: typeof ChromiumType };

export interface WebCaptureOptions {
  steps?: Steps; script?: string; url?: string; serve?: string; width: number; height: number; scale: number;
  fps: number | string; out: string; recordText: boolean; headed?: boolean; browser?: "chromium" | "chrome" | "msedge";
  logger?: (message: string) => void;
}
export interface WebCaptureResult { dir: string; session: LoadedSession; warnings: string[] }
export interface ActionRecorder {
  readonly actions: PendingAction[];
  readonly recordText: boolean;
  readonly scale: number;
  action(kind: CaptureAction["kind"], opts: { label?: string; locator?: Locator; text?: string; chars?: number; key?: string },
    work: () => Promise<unknown>): Promise<void>;
  mark(label: string): void;
}
export interface ScreencastOptions { dir: string; t0: SessionClockOrigin; nowMs(): number; width: number; height: number; scale: number;
  assertGeometry?: boolean; logger?: (message: string) => void }
export interface Screencast { frames: CapturedFrame[]; stop(): Promise<void> }

function scaleBox(box: Box, scale: number): Box {
  return { x: box.x * scale, y: box.y * scale, width: box.width * scale, height: box.height * scale };
}

export function createActionRecorder(nowMs: () => number, scale: number, recordText: boolean): ActionRecorder {
  const actions: PendingAction[] = [];
  async function action(kind: CaptureAction["kind"], opts: { label?: string; locator?: Locator; text?: string; chars?: number; key?: string },
    work: () => Promise<unknown>): Promise<void> {
    const rawBox = opts.locator ? await opts.locator.boundingBox() : null;
    const bbox = rawBox ? scaleBox(rawBox, scale) : undefined;
    const tMs = nowMs();
    const item: PendingAction = { id: `a${actions.length + 1}`, seq: actions.length, kind, tMs, source: "agent",
      ...(opts.label ? { label: opts.label } : {}), ...(bbox ? { bbox,
        point: { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 } } : {}),
      ...(opts.text !== undefined ? { chars: opts.text.length, ...(recordText ? { text: opts.text } : {}) } : {}),
      ...(opts.chars !== undefined ? { chars: opts.chars } : {}), ...(opts.key ? { key: opts.key } : {}) };
    actions.push(item);
    try { await work(); } finally { item.endMs = nowMs(); }
  }
  function mark(label: string): void {
    const tMs = nowMs();
    actions.push({ id: `a${actions.length + 1}`, seq: actions.length, kind: "mark", label, tMs, endMs: tMs, source: "agent" });
  }
  return { actions, recordText, scale, action, mark };
}

function navigation(base: string | undefined, target: string): string {
  try { return new URL(target, base).href; }
  catch { throw new Vid2Error("E_INPUT", `Invalid navigation URL: ${target}`); }
}

/** Run declarative steps; only actions, not waits/eval, enter the public action log. */
export async function runSteps(page: Page, steps: Steps, recorder: ActionRecorder, baseUrl?: string): Promise<void> {
  for (const step of StepsSchema.parse(steps)) {
    if ("goto" in step) await recorder.action("goto", {}, () => page.goto(navigation(baseUrl ?? page.url(), step.goto)));
    else if ("click" in step) {
      const locator = page.locator(step.click);
      await recorder.action("click", { locator, ...(step.label ? { label: step.label } : {}) }, () => locator.click());
    } else if ("type" in step) {
      const locator = page.locator(step.type);
      await recorder.action("type", { locator, text: step.text, ...(step.label ? { label: step.label } : {}) },
        () => locator.pressSequentially(step.text, { delay: step.delayMs ?? 0 }));
    } else if ("press" in step) await recorder.action("press", { key: step.press }, () => page.keyboard.press(step.press));
    else if ("hover" in step) {
      const locator = page.locator(step.hover);
      await recorder.action("hover", { locator }, () => locator.hover());
    } else if ("scroll" in step) await recorder.action("scroll", {}, () => page.mouse.wheel(0, step.scroll.y));
    else if ("wait" in step) {
      if (typeof step.wait === "number") await page.waitForTimeout(step.wait);
      else await page.locator(step.wait.selector).waitFor();
    } else if ("waitFor" in step) {
      if (step.waitFor.url) await page.waitForURL(step.waitFor.url);
      if (step.waitFor.selector) await page.locator(step.waitFor.selector).waitFor();
      if (step.waitFor.response) await page.waitForResponse(step.waitFor.response);
    } else if ("mark" in step) recorder.mark(step.mark);
    else await page.evaluate(step.eval);
  }
}

/** Ack CDP frames after writing; retain JPEGs and timestamp them on the session clock. */
export async function startScreencast(cdpSession: CDPSession, opts: ScreencastOptions): Promise<Screencast> {
  await mkdir(join(opts.dir, "raw"), { recursive: true });
  const frames: CapturedFrame[] = [];
  const pending = new Set<Promise<void>>();
  let next = 0;
  let stopped = false;
  let failure: Error | undefined;
  cdpSession.on("Page.screencastFrame", (event: { data: string; metadata: { timestamp?: number }; sessionId: number }) => {
    const receivedMs = opts.nowMs();
    const n = next++;
    const file = join(opts.dir, "raw", `${String(n).padStart(6, "0")}.jpg`);
    const task = (async () => {
      try {
        const data = Buffer.from(event.data, "base64");
        if (n === 0 && opts.assertGeometry !== false) {
          const actual = jpegDimensions(data);
          const expected = { width: opts.width * opts.scale, height: opts.height * opts.scale };
          if (actual.width !== expected.width || actual.height !== expected.height) {
            throw new Vid2Error("E_CAPABILITY", "CDP screencast geometry does not match requested viewport and scale",
              { details: { expected, actual } });
          }
        }
        await writeFile(file, data);
        frames.push({ n, tMs: cdpFrameMs(event.metadata.timestamp, opts.t0, receivedMs), file });
        if (n % 30 === 0) opts.logger?.(`captured ${n + 1} CDP frames`);
      } catch (error) { failure = error instanceof Error ? error : new Error("Could not save CDP frame"); }
      finally {
        try { await cdpSession.send("Page.screencastFrameAck", { sessionId: event.sessionId }); }
        catch (error) { failure = error instanceof Error ? error : new Error("Could not acknowledge CDP frame"); }
      }
    })();
    pending.add(task);
    void task.then(() => pending.delete(task));
  });
  await cdpSession.send("Page.startScreencast", { format: "jpeg", quality: 88,
    maxWidth: opts.width * opts.scale, maxHeight: opts.height * opts.scale, everyNthFrame: 1 });
  return { frames, async stop() {
    if (!stopped) { stopped = true; await cdpSession.send("Page.stopScreencast"); }
    await Promise.all(pending);
    frames.sort((a, b) => a.n - b.n);
    if (failure) throw failure;
  } };
}

async function loadPlaywright(): Promise<PlaywrightModule> {
  try { return await import("playwright-core"); }
  catch (cause) { throw new Vid2Error("E_CAPABILITY", "Web capture needs playwright-core",
    { cause, fix: "Install playwright-core and a Chromium browser" }); }
}

async function launchBrowser(pw: PlaywrightModule, opts: WebCaptureOptions, windowHeight: number): Promise<Browser> {
  const channel = opts.browser === "chrome" ? "chrome" : opts.browser === "msedge" ? "msedge" : undefined;
  try { return await pw.chromium.launch({ headless: !opts.headed, ...(channel ? { channel } : {}),
    args: [`--window-size=${opts.width},${windowHeight}`, `--force-device-scale-factor=${opts.scale}`] }); }
  catch (cause) { throw new Vid2Error("E_CAPABILITY", "Could not launch Chromium for web capture",
    { cause, fix: "Install Chromium with: npx playwright-core install chromium" }); }
}

async function makePage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: null, locale: "en-US" });
  const page = await context.newPage();
  return { context, page };
}

async function launchMeasured(pw: PlaywrightModule, opts: WebCaptureOptions): Promise<{
  browser: Browser; context: BrowserContext; page: Page }> {
  let windowHeight = opts.height;
  for (let attempt = 0; attempt < 3; attempt++) {
    const browser = await launchBrowser(pw, opts, windowHeight);
    const { context, page } = await makePage(browser);
    const measured = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, chromeHeight: outerHeight - innerHeight }));
    if (measured.width === opts.width && measured.height === opts.height) return { browser, context, page };
    await browser.close();
    windowHeight = Math.max(100, attempt === 0 ? opts.height + measured.chromeHeight : windowHeight + opts.height - measured.height);
  }
  throw new Vid2Error("E_CAPABILITY", "Chromium viewport differs from requested capture size");
}

export interface ScriptHelpers { page: Page; click(locator: string | Locator, opts?: { label?: string }): Promise<void>;
  type(locator: string | Locator, text: string, opts?: { label?: string; delayMs?: number }): Promise<void>;
  press(key: string): Promise<void>; mark(label: string): void; wait(ms: number): Promise<void> }

async function runScript(page: Page, path: string, recorder: ActionRecorder): Promise<void> {
  const module = await import(pathToFileURL(resolve(path)).href) as { default?: (helpers: ScriptHelpers) => Promise<void> };
  if (typeof module.default !== "function") throw new Vid2Error("E_INPUT", "Capture script must export an async default function");
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

function validateOptions(opts: WebCaptureOptions): Fps {
  if (!Number.isInteger(opts.width) || !Number.isInteger(opts.height) || opts.width < 16 || opts.height < 16 ||
    !Number.isFinite(opts.scale) || opts.scale <= 0) throw new Vid2Error("E_INPUT", "Invalid web capture dimensions or scale");
  if (!!opts.steps === !!opts.script) throw new Vid2Error("E_INPUT", "Choose exactly one of steps or script");
  if (opts.serve && opts.url) throw new Vid2Error("E_INPUT", "Choose either serve or url");
  return parseFps(opts.fps);
}

/** Capture a Chromium page into a versioned session directory. */
export async function captureWeb(opts: WebCaptureOptions): Promise<WebCaptureResult> {
  const fps = validateOptions(opts);
  const dir = resolve(opts.out);
  const tools = locateTools();
  const ffmpeg = await probeFfmpeg({ tools });
  if (ffmpeg.major < 6 || ffmpeg.major === 6 && ffmpeg.minor < 1) {
    throw new Vid2Error("E_CAPABILITY", "Web capture requires ffmpeg 6.1 or newer");
  }
  const pw = await loadPlaywright();
  const hosted = opts.serve ? await serveDir(opts.serve) : undefined;
  let browser: Browser | undefined;
  try {
    const launched = await launchMeasured(pw, opts);
    browser = launched.browser;
    const { context, page } = launched;
    const cdp = await context.newCDPSession(page);
    await mkdir(dir, { recursive: true });
    const clock = createClock();
    const recorder = createActionRecorder(() => clock.nowMs(), opts.scale, opts.recordText);
    const cast = await startScreencast(cdp, { dir, t0: clock.t0, nowMs: () => clock.nowMs(),
      width: opts.width, height: opts.height, scale: opts.scale, ...(opts.logger ? { logger: opts.logger } : {}) });
    const baseUrl = hosted?.url ?? opts.url;
    try {
      if (opts.url && (!opts.steps?.[0] || !("goto" in opts.steps[0]))) {
        await recorder.action("goto", {}, () => page.goto(opts.url!));
      }
      if (opts.steps) await runSteps(page, opts.steps, recorder, baseUrl);
      else await runScript(page, opts.script!, recorder);
      await page.waitForTimeout(250);
    } finally { await cast.stop(); }
    const endMs = clock.nowMs();
    const encoded = await finalizeFrames({ dir, frames: cast.frames, actions: recorder.actions,
      fps, endMs, ffmpeg: tools.ffmpeg });
    const meta: SessionMeta = { version: 1, surface: "web", fps: fpsString(fps), width: encoded.width, height: encoded.height,
      scale: opts.scale, t0: clock.t0, footage: "footage.mp4", frames: "frames.jsonl", actions: "actions.jsonl",
      cursorHidden: true, recordedText: opts.recordText,
      tool: { vid2: packageVersion(), ffmpeg: ffmpeg.version, playwright: `${pw.chromium.name()} ${browser.version()}` },
      platform: process.platform, createdAt: new Date().toISOString(), warnings: [] };
    await writeSession(dir, meta, encoded.actions);
    return { dir, session: await readSession(dir), warnings: meta.warnings };
  } finally {
    if (browser) await browser.close();
    if (hosted) await hosted.close();
  }
}
