import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import type { RenderPlan } from "../compile/ir.ts";
import type { FfmpegInfo } from "../probe/ffmpeg.ts";
import type { Runner } from "../shared/exec.ts";
import { Vid2Error } from "../shared/errors.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";
import { clearEncoderProbes, fallbackBitrate, hardwareRequest, probeEncoder, selectEncoder } from "./encoders.ts";
import type { SelectInput } from "./encoders.ts";
import { locateTools } from "../probe/index.ts";
import { renderPlan } from "./runner.ts";

function info(encoders: string[]): FfmpegInfo {
  return { path: "ffmpeg", version: "8.0", major: 8, minor: 0, buildFlags: [], filters: new Set(),
    encoders: new Set(encoders), decoders: new Set(), devices: { demuxers: [] }, hwaccels: [],
    libs: { ass: false, freetype: false, harfbuzz: false, vmaf: false, placebo: false } };
}

function input(encoders: string[], codec = "h264", container = "mp4"): SelectInput {
  return { info: info(encoders), ffmpeg: "ffmpeg", codec, container, width: 1920, height: 1080, fps: 30 };
}

/** Fake ffmpeg: a probe fails when its argv contains one of the failing strings. */
function fake(failing: string[], calls: string[][] = []): Runner {
  return async (_cmd, args) => {
    calls.push(args);
    const bad = failing.find((needle) => args.includes(needle));
    return { code: bad ? 1 : 0, signal: null, stdout: Buffer.alloc(0), stderr: bad ? "No capable devices found\n" : "", ms: 1 };
  };
}

test("if-possible probes in family order and skips an encoder whose probe fails", async () => {
  clearEncoderProbes();
  const s = await selectEncoder(input(["h264_qsv", "h264_nvenc"]), { mode: "if-possible" }, fake(["h264_nvenc"]));
  assert.equal(s.choice?.name, "h264_qsv");
  assert.deepEqual(s.tried, [{ name: "h264_nvenc", error: "No capable devices found" }]);
  assert.deepEqual(s.warnings, []);
});

test("disable never probes; if-possible falls back to software with a warning", async () => {
  clearEncoderProbes();
  const calls: string[][] = [];
  assert.equal((await selectEncoder(input(["h264_nvenc"]), { mode: "disable" }, fake([], calls))).choice, null);
  assert.equal(calls.length, 0);
  const none = await selectEncoder(input([]), { mode: "if-possible" }, fake([]));
  assert.equal(none.choice, null);
  assert.match(none.warnings[0] ?? "", /No h264 hardware encoder in this ffmpeg; using software/);
});

test("required throws E_CAPABILITY with every failed probe", async () => {
  clearEncoderProbes();
  await assert.rejects(selectEncoder(input(["h264_nvenc", "h264_amf"]), { mode: "required" }, fake(["h264_nvenc", "h264_amf"])),
    (error: unknown) => error instanceof Vid2Error && error.code === "E_CAPABILITY" &&
      (error.details?.["tried"] as { name: string }[]).map((t) => t.name).join() === "h264_nvenc,h264_amf");
  await assert.rejects(selectEncoder(input(["h264_videotoolbox"], "vp9", "webm"), { mode: "required" }, fake([])),
    (error: unknown) => error instanceof Vid2Error && /H.264, HEVC and ProRes only/.test(error.message));
});

test("HEVC VideoToolbox tags hvc1 and falls back to a bitrate when constant quality is unavailable", async () => {
  clearEncoderProbes();
  const s = await selectEncoder(input(["hevc_videotoolbox"], "hevc"), { mode: "if-possible" }, fake(["-q:v"]));
  assert.deepEqual(s.choice?.args, ["-c:v", "hevc_videotoolbox", "-b:v", "9.3M", "-pix_fmt", "yuv420p", "-tag:v", "hvc1"]);
  assert.equal(fallbackBitrate(1280, 720, 30), "4.1M");
  const prores = await selectEncoder(input(["prores_videotoolbox", "prores_ks"], "prores", "mov"), { mode: "required" }, fake([]));
  assert.equal(prores.choice?.name, "prores_videotoolbox");
});

test("VAAPI opens the device before the inputs and uploads frames at the end of the chain", async () => {
  clearEncoderProbes();
  const calls: string[][] = [];
  const s = await selectEncoder(input(["h264_vaapi", "h264_nvenc"]), { mode: "required", family: "vaapi" }, fake([], calls));
  assert.equal(s.choice?.name, "h264_vaapi");
  assert.deepEqual(s.choice?.preInput, ["-vaapi_device", "/dev/dri/renderD128"]);
  assert.equal(s.choice?.filter, "format=nv12,hwupload");
  const probe = calls[0]!;
  assert.ok(probe.indexOf("-vaapi_device") < probe.indexOf("-i") && probe.indexOf("-vf") > probe.indexOf("-i"));
});

test("probe results are cached per ffmpeg and argument set", async () => {
  clearEncoderProbes();
  const calls: string[][] = [];
  const choice = { name: "h264_nvenc", args: ["-c:v", "h264_nvenc"], preInput: [], filter: null };
  assert.equal(await probeEncoder("ffmpeg", choice, fake([], calls)), null);
  assert.equal(await probeEncoder("ffmpeg", choice, fake([], calls)), null);
  assert.equal(calls.length, 1);
});

test("CLI values map to a hardware request", () => {
  assert.deepEqual(hardwareRequest({}), { mode: "disable" });
  assert.deepEqual(hardwareRequest({ hw: true }), { mode: "if-possible" });
  assert.deepEqual(hardwareRequest({ hw: true, accel: "required" }), { mode: "required" });
  assert.deepEqual(hardwareRequest({ family: "nvenc" }), { mode: "if-possible", family: "nvenc" });
  assert.throws(() => hardwareRequest({ accel: "maybe" }), /--hw-accel must be/);
  assert.throws(() => hardwareRequest({ family: "cuda" }), /--hw-encoder must be one of/);
});

const localVersion = (() => {
  const text = spawnSync("ffmpeg", ["-hide_banner", "-version"], { encoding: "utf8" }).stdout ?? "";
  const m = /ffmpeg version n?(\d+)\.(\d+)/.exec(text);
  return m ? { version: m[1] + "." + m[2], major: Number(m[1]), minor: Number(m[2]) } : { version: "8.0", major: 8, minor: 0 };
})();

function onePlan(root: string): RenderPlan {
  const fps = { num: 30, den: 1 };
  return { planVersion: 1, timelineHash: "hw-test", profile: "final",
    output: { width: 320, height: 180, fps, background: "#000000", container: "mp4", videoCodec: "h264", quality: "high" }, totalFrames: 12,
    segments: [{ id: "s0", sceneId: "s0", index: 0, frames: 12, renderFrames: 12, width: 320, height: 180, fps,
      inputs: [{ id: "c", kind: "lavfi", lavfi: "testsrc2", args: ["-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=0.4"] }],
      graph: "[0:v]format=yuv420p,setsar=1,scale=out_range=tv[vout]", outLabel: "vout", assFiles: [], fontFiles: [], textBackend: "ass" as const,
      internalRate: 1, stageDeps: [], hash: "hw-test" }],
    join: { segments: [{ id: "s0", frames: 12, renderFrames: 12 }], steps: [], totalFrames: 12, graph: "" },
    post: { overlays: [], effects: [], inputs: [], graph: null }, audio: null, stageRenders: [], workDir: join(root, "work"),
    tool: { ...locateTools(), ...localVersion } };
}

// Runs on every CI host: with a working hardware encoder the render uses it, without one if-possible falls back and required fails.
test("real render reports the encoder it used for every hardware mode", async (t) => {
  if (!requireFfmpeg(t)) return;
  clearEncoderProbes();
  const root = mkdtempSync(join(tmpdir(), "vid2-hw-"));
  const soft = await renderPlan(onePlan(root), { out: join(root, "soft.mp4"), noCache: true });
  assert.deepEqual(soft.encoder, { name: "libx264", hardware: false });
  const maybe = await renderPlan(onePlan(root), { out: join(root, "maybe.mp4"), noCache: true, hw: { mode: "if-possible" } });
  const manifest = JSON.parse(readFileSync(maybe.manifest, "utf8")) as { encoder: unknown };
  assert.deepEqual(manifest.encoder, maybe.encoder);
  if (maybe.encoder.hardware) {
    const required = await renderPlan(onePlan(root), { out: join(root, "required.mp4"), noCache: true, hw: { mode: "required" } });
    assert.equal(required.encoder.name, maybe.encoder.name);
  } else {
    assert.match(maybe.warnings.join("\n"), /using software/);
    await assert.rejects(renderPlan(onePlan(root), { out: join(root, "required.mp4"), noCache: true, hw: { mode: "required" } }),
      (error: unknown) => error instanceof Vid2Error && error.code === "E_CAPABILITY");
  }
  t.diagnostic("encoder: " + maybe.encoder.name);
});
