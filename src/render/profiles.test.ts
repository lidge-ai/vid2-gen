import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResolvedOutput } from "../compile/ir.ts";
import { applyProfile, videoArgs } from "./profiles.ts";

const output: ResolvedOutput = { width: 321, height: 181, fps: { num: 15, den: 1 }, background: "#000000",
  container: "mp4", videoCodec: "h264", quality: "high" };

test("proxy is half-sized with even dimensions and no oversample", () => {
  assert.deepEqual(applyProfile(output, "proxy"), { ...output, width: 160, height: 90,
    quality: "proxy", scale: 0.5, oversample: 1 });
  assert.equal(applyProfile(output, "final").oversample, 2);
  assert.deepEqual(videoArgs(output, "proxy"), ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", "-pix_fmt", "yuv420p"]);
});
