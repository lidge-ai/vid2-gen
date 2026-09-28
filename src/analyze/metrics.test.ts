import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChecked } from "../shared/index.ts";
import { measureShots } from "./metrics.ts";

void test("solid-color shots have near-zero motion and distinct palettes/luma", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vid2-metrics-"));
  try {
    const video = join(dir, "colors.mp4");
    await runChecked("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=160x90:r=10:d=1",
      "-f", "lavfi", "-i", "color=c=white:s=160x90:r=10:d=1", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]",
      "-map", "[v]", "-c:v", "mpeg4", "-y", video]);
    const stats = await measureShots(video, [
      { id: "a", startFrame: 0, endFrame: 10, startS: 0, endS: 1 },
      { id: "b", startFrame: 10, endFrame: 20, startS: 1, endS: 2 },
    ], "ffmpeg");
    assert.ok(stats[0]!.motion < 1);
    assert.ok(stats[1]!.motion < 1);
    assert.ok(stats[1]!.meanLuma > stats[0]!.meanLuma + 100);
    assert.notDeepEqual(stats[0]!.palette, stats[1]!.palette);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
