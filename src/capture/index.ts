export * from "./session.ts";
export { createCaptureResolver } from "./resolver.ts";
export { decorateCaptureLayers, cameraAt } from "./decorate.ts";
export { captureWeb, runSteps, startScreencast, createActionRecorder } from "./web.ts";
export type { WebCaptureOptions, WebCaptureResult } from "./web.ts";
export { StepsSchema, stepsJsonSchema } from "./steps.ts";
export { serveDir } from "./serve.ts";
export { quantize, finalizeFrames } from "./quantize.ts";
export { captureNative } from "./native.ts";
export type { NativeCaptureOptions } from "./native.ts";
export { listDevices, classifyCaptureFailure } from "./devices.ts";
export { appendMark, loadHook } from "./input-hook.ts";
export { captureElectron } from "./electron.ts";
export { captureTerminal, parseTape, parseCast } from "./terminal.ts";
export { planCamera } from "./camera.ts";
export { planCursor, cursorSprite, rippleSprite } from "./cursor.ts";
import { isAbsolute, resolve } from "node:path";
import type { EventResolver, Timeline } from "../timeline/index.ts";
import { createCaptureResolver } from "./resolver.ts";
import { readSession } from "./session.ts";
import type { LoadedSession } from "./session.ts";

/** Sessions for every capture source of a timeline plus their EventResolver (undefined when there are none). */
export async function loadCaptures(sources: Timeline["sources"], baseDir: string): Promise<{ events: EventResolver; sessions: Record<string, LoadedSession> } | undefined> {
  const sessions: Record<string, LoadedSession> = {};
  for (const [id, source] of Object.entries(sources)) {
    if (source.type !== "capture") continue;
    sessions[id] = await readSession(isAbsolute(source.session) ? source.session : resolve(baseDir, source.session));
  }
  return Object.keys(sessions).length ? { events: createCaptureResolver(sessions), sessions } : undefined;
}
