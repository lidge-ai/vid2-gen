import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { RunResult, Runner } from "../shared/index.ts";
import { appendMark } from "./input-hook.ts";
import { captureNative, nativeInputArgs, runNativeProcess } from "./native.ts";
import type { NativeCaptureOptions } from "./native.ts";
import type { CaptureDeviceListing } from "./devices.ts";

const devices: CaptureDeviceListing = { backend: "avfoundation", screens: [
  { display: 0, deviceIndex: 2, name: "Capture screen 0", width: 128, height: 128 },
  { display: 1, deviceIndex: 3, name: "Capture screen 1", width: 128, height: 128 }],
  windows: [], cameras: [], audio: [] };
const options = (out = "capture.vid2cap"): NativeCaptureOptions => ({ fps: 30, display: 0, events: false, cursor: "hide", out });
const caps = (filters: string[], major = 8, minor = 1) => ({ filters: new Set(filters), major, minor, version: `${major}.${minor}` });
const result = (stdout = "", stderr = "", code = 0): RunResult => ({ code, signal: null, stdout: Buffer.from(stdout), stderr, ms: 0 });

void test("native arguments map display number to AVFoundation device index", () => {
  const input = nativeInputArgs(options(), devices, caps([]), "darwin");
  assert.equal(input.backend, "avfoundation");
  assert.ok(input.args.includes("2:none"));
  assert.deepEqual(input.args.slice(input.args.indexOf("-capture_cursor"), input.args.indexOf("-capture_cursor") + 2), ["-capture_cursor", "0"]);
  assert.ok(nativeInputArgs({ ...options(), display: 1 }, devices, caps([]), "darwin").args.includes("3:none"));
  assert.throws(() => nativeInputArgs({ ...options(), display: 9 }, devices, caps([]), "darwin"), { code: "E_CAPABILITY" });
});

void test("Windows selects gated gfxcapture, ddagrab, then gdigrab", () => {
  const window = nativeInputArgs({ fps: 30, events: false, cursor: "hide", out: "capture.vid2cap", window: "Editor" }, devices, caps(["gfxcapture"]), "win32");
  assert.equal(window.backend, "gfxcapture");
  assert.match(window.args.at(-1) ?? "", /gfxcapture=window_title=Editor/);
  assert.equal(nativeInputArgs({ fps: 30, events: false, cursor: "hide", out: "capture.vid2cap", window: "Editor" }, devices, caps(["gfxcapture"], 8, 0), "win32").backend, "gdigrab");
  const display = nativeInputArgs(options(), devices, caps(["ddagrab"]), "win32");
  assert.equal(display.backend, "ddagrab");
  assert.match(display.args.at(-1) ?? "", /hwdownload,format=bgra/);
  assert.equal(nativeInputArgs(options(), devices, caps([]), "win32").backend, "gdigrab");
});

void test("X11 coordinates and Wayland error are explicit", () => {
  const x11 = nativeInputArgs({ ...options(), display: 1 }, devices, caps([]), "linux", { DISPLAY: ":1.0" });
  assert.equal(x11.backend, "x11grab");
  assert.ok(x11.args.includes(":1.0+0,0"));
  assert.throws(() => nativeInputArgs(options(), devices, caps([]), "linux", { WAYLAND_DISPLAY: "wayland-0" }), { code: "E_CAPABILITY" });
});

void test("capture writes a mark-only native session through injected runner", async () => {
  const root = mkdtempSync(join(tmpdir(), "vid2-native-fake-"));
  const out = join(root, "capture.vid2cap");
  const fixture = readFileSync(new URL("../../tests/fixtures/capture/devices/avfoundation.txt", import.meta.url), "utf8");
  let captureInput = "";
  const runner: Runner = async (cmd, args) => {
    if (args.includes("-list_devices")) return result("", fixture, 251);
    if (cmd === "osascript") return result("[]");
    if (cmd === "system_profiler") return result(JSON.stringify({ SPDisplaysDataType: [{ spdisplays_ndrvs: [{
      _spdisplays_pixels: "128 x 128", _spdisplays_resolution: "64 x 64 @ 60Hz" }] }] }));
    if (cmd === "ffprobe") return result(JSON.stringify({ streams: [{ width: 128, height: 128, nb_read_frames: "6" }] }));
    if (args.includes("-frames:v")) return result("lavfi.signalstats.YMAX=80\n");
    const output = args.at(-1)!;
    if (output.endsWith("raw.mp4")) { captureInput = args[args.indexOf("-i") + 1]!; await appendMark(out, "launch"); }
    writeFileSync(output, "fake footage");
    return result();
  };
  try {
    const captured = await captureNative({ ...options(out), duration: 0.2, runner, capabilities: caps([]) });
    assert.equal(captureInput, "2:none");
    assert.equal(captured.session.meta.surface, "native");
    assert.equal(captured.session.meta.scale, 2);
    assert.equal(captured.session.actions.length, 1);
    assert.equal(captured.session.actions[0]?.label, "launch");
    assert.equal(captured.session.actions[0]?.text, undefined);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

void test("stop file sends q to a running capture process", async () => {
  const root = mkdtempSync(join(tmpdir(), "vid2-native-stop-"));
  try {
    const stopFile = join(root, "stop");
    const script = "process.stdin.on('data', d => { if (d.toString().includes('q')) { process.stdout.write('stopped'); process.exit(0) } })";
    const running = runNativeProcess(process.execPath, ["-e", script], stopFile);
    writeFileSync(stopFile, "");
    const stopped = await running;
    assert.equal(stopped.code, 0);
    assert.equal(stopped.stdout.toString("utf8"), "stopped");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

void test("capture runner maps denial and ambiguous device failures to distinct codes", async () => {
  const fixture = readFileSync(new URL("../../tests/fixtures/capture/devices/avfoundation.txt", import.meta.url), "utf8");
  const root = mkdtempSync(join(tmpdir(), "vid2-native-fail-"));
  try {
    for (const [message, code] of [["[AVFoundation indev] Screen capture not authorized", "E_ACCESS"],
      ["Unknown device index 99", "E_CAPABILITY"]] as const) {
      const runner: Runner = async (cmd, args) => {
        if (args.includes("-list_devices")) return result("", fixture, 251);
        if (cmd === "osascript") return result("[]");
        if (cmd === "system_profiler") return result("{}");
        return result("", message, 1);
      };
      await assert.rejects(captureNative({ ...options(join(root, code)), duration: 0.1, runner, capabilities: caps([]) }),
        (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === code);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
