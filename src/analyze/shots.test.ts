import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChecked } from "../shared/index.ts";
import { detectShots } from "./shots.ts";

void test("scene fallback locates hard color cuts within one frame", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vid2-shots-"));
  try {
    const video = join(dir, "cuts.mp4");
    await runChecked("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=160x90:r=30:d=1",
      "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=30:d=1", "-f", "lavfi", "-i", "color=c=green:s=160x90:r=30:d=1",
      "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]", "-c:v", "mpeg4", "-q:v", "2", "-y", video]);
    const shots = await detectShots(video, 90, 30, "ffmpeg");
    assert.equal(shots.length, 3);
    assert.ok(Math.abs(shots[1]!.startFrame - 30) <= 1);
    assert.ok(Math.abs(shots[2]!.startFrame - 60) <= 1);
    assert.equal(shots[1]!.sceneId, null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
