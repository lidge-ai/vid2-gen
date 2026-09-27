import assert from "node:assert/strict";
import { test } from "node:test";
import type { FfmpegInfo } from "../probe/ffmpeg.ts";
import { selectHardwareEncoder } from "./encoders.ts";

function info(encoders: string[]): FfmpegInfo {
  return { path: "ffmpeg", version: "8.0", major: 8, minor: 0, buildFlags: [], filters: new Set(),
    encoders: new Set(encoders), decoders: new Set(), devices: { demuxers: [] }, hwaccels: [],
    libs: { ass: false, freetype: false, harfbuzz: false, vmaf: false, placebo: false } };
}

test("hardware selection follows priority and warns on absence", () => {
  assert.equal(selectHardwareEncoder(info(["h264_qsv", "h264_nvenc"]), true).name, "h264_nvenc");
  assert.equal(selectHardwareEncoder(info([]), true).name, null);
  assert.match(selectHardwareEncoder(info([]), true).warning ?? "", /software/);
  assert.deepEqual(selectHardwareEncoder(info(["h264_nvenc"]), false), { args: [], name: null });
});
