import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runChecked } from "../shared/index.ts";
import type { RunResult, Runner } from "../shared/index.ts";
import { locateTools } from "../probe/index.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";
import { blackFootageWarning, classifyCaptureFailure, listDevices } from "./devices.ts";

const fixture = (name: string) => readFileSync(new URL(`../../tests/fixtures/capture/devices/${name}`, import.meta.url), "utf8");
const response = (stdout = "", stderr = "", code = 0): RunResult =>
  ({ code, signal: null, stdout: Buffer.from(stdout), stderr, ms: 0 });

void test("avfoundation maps Capture screen 0 to its listed device index", async () => {
  const runner: Runner = async (cmd) => cmd === "osascript" ? response(JSON.stringify([
    { name: "Editor", position: [10, 20], size: [640, 480] }])) : response("", fixture("avfoundation.txt"), 251);
  const devices = await listDevices(runner, "darwin");
  assert.equal(devices.backend, "avfoundation");
  assert.deepEqual(devices.screens.find((item) => item.display === 0), { display: 0, deviceIndex: 2, name: "Capture screen 0" });
  assert.ok(devices.cameras.length >= 1);
  assert.ok(devices.audio.length >= 1);
  assert.deepEqual(devices.windows, ["Editor"]);
});

void test("Windows and X11 listings preserve their enumerated devices", async () => {
  const win: Runner = async (cmd) => cmd === "powershell.exe" ? response("Editor\n") : response("", fixture("dshow-ddagrab.txt"), 1);
  const windows = await listDevices(win, "win32");
  assert.equal(windows.cameras[0]?.name, "Integrated Camera");
  assert.equal(windows.audio[0]?.name, "Microphone Array");
  assert.deepEqual(windows.windows, ["Editor"]);
  const linux: Runner = async (cmd) => cmd === "xrandr" ? response(fixture("x11-monitors.txt")) : response("0x1  0 host Terminal\n");
  const x11 = await listDevices(linux, "linux");
  assert.equal(x11.screens[1]?.display, 1);
  assert.equal(x11.screens[1]?.x, 1920);
  assert.equal(x11.screens[1]?.width, 1280);
  assert.deepEqual(x11.windows, ["Terminal"]);
});

void test("only permission-specific capture failures become E_ACCESS", () => {
  assert.equal(classifyCaptureFailure("[AVFoundation indev] Screen capture not authorized", "darwin").code, "E_ACCESS");
  assert.equal(classifyCaptureFailure("[ddagrab] E_ACCESSDENIED", "win32").code, "E_ACCESS");
  for (const [message, platform] of [["Failed to create input", "darwin"], ["Unknown device index 99", "darwin"],
    ["Cannot open display :0", "linux"], ["Device unavailable", "win32"]] as const) {
    const error = classifyCaptureFailure(message, platform);
    assert.equal(error.code, "E_CAPABILITY");
    assert.equal(error.details?.["stderrTail"], message);
    assert.match(error.fix ?? "", /capture devices/);
  }
});

void test("black footage yields a warning; white footage does not", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ffmpeg } = locateTools();
  const dir = mkdtempSync(join(tmpdir(), "vid2-black-test-"));
  try {
    for (const color of ["black", "white"]) await runChecked(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi",
      "-i", `color=c=${color}:s=64x64:r=30`, "-frames:v", "30", "-c:v", "ffv1", "-y", join(dir, `${color}.mkv`)]);
    assert.match(await blackFootageWarning(join(dir, "black.mkv")) ?? "", /Footage is black/);
    assert.equal(await blackFootageWarning(join(dir, "white.mkv")), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
