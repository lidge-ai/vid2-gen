import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { locateTools } from "../probe/index.ts";
import { runChecked } from "../shared/index.ts";
import { frameArgs, frameSeekArgs, rateValue } from "./artifacts.ts";

test("rate and seek helpers", () => {
  assert.equal(rateValue("30/1"), 30);
  assert.ok(Math.abs(rateValue("30000/1001")! - 29.97) < 0.001);
  assert.equal(rateValue("0/0"), undefined);
  assert.equal(rateValue(undefined), undefined);
  assert.deepEqual(frameSeekArgs(0, 30), []);
  assert.deepEqual(frameSeekArgs(30, undefined), []);
  assert.deepEqual(frameSeekArgs(30, 30), ["-ss", "0.983333"]);
});

test("input seek returns the same frame as a full-decode select", async () => {
  const { ffmpeg } = locateTools();
  const dir = await mkdtemp(join(tmpdir(), "vid2-seek-"));
  try {
    const video = join(dir, "clip.mp4");
    for (const [rate, name] of [["30", "30"], ["30000/1001", "ntsc"]] as const) {
      await runChecked(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=s=96x54:r=${rate}:d=5`,
        "-c:v", "libx264", "-g", "48", "-pix_fmt", "yuv420p", video]);
      const fps = rateValue(rate);
      for (const frame of [0, 1, 29, 30, 47, 48, 49, 97, 149]) {
        const grab = (seekFps: number | undefined) => runChecked(ffmpeg, ["-v", "error",
          ...frameArgs(video, frame, seekFps, "format=rgb24"), "-f", "rawvideo", "pipe:1"]);
        const [seeked, decoded] = await Promise.all([grab(fps), grab(undefined)]);
        assert.ok(seeked.stdout.length > 0, `${name} frame ${frame} empty`);
        assert.ok(seeked.stdout.equals(decoded.stdout), `${name} frame ${frame} differs`);
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
