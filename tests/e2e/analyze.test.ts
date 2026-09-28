import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runChecked, run } from "../../src/shared/index.ts";

const cli = resolve(import.meta.dirname, "../../src/cli/index.ts");

void test("analyze CLI emits a three-shot timeline report and scene fallback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vid2-analyze-e2e-"));
  try {
    const video = join(dir, "film.mp4"), timeline = join(dir, "timeline.json");
    await runChecked("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=160x90:r=30:d=1",
      "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=30:d=1", "-f", "lavfi", "-i", "color=c=green:s=160x90:r=30:d=1",
      "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]", "-c:v", "mpeg4", "-q:v", "2", "-y", video]);
    await writeFile(timeline, JSON.stringify({ version: 1, output: { width: 160, height: 90, fps: 30 },
      beat: { bpm: 120 }, scenes: ["one", "two", "three"].map((id) => ({ id, duration: "1s" })) }));
    const result = await run(process.execPath, [cli, "analyze", video, "--timeline", timeline, "--json"], { cwd: dir });
    assert.equal(result.code, 0, result.stdout.toString("utf8") + result.stderr);
    const body = JSON.parse(result.stdout.toString("utf8")) as { ok: boolean; data: { method: string; shots: { sceneId: string; beats: number }[]; warnings: string[] } };
    assert.equal(body.ok, true);
    assert.equal(body.data.method, "timeline");
    assert.deepEqual(body.data.shots.map((shot) => shot.sceneId), ["one", "two", "three"]);
    assert.ok(body.data.shots.every((shot) => Math.abs(shot.beats - 2) < 0.001));
    assert.ok(body.data.warnings.includes("NO_AUDIO"));
    const report = JSON.parse(await readFile(`${video}.analyze/report.json`, "utf8")) as { method: string };
    assert.equal(report.method, "timeline");
    const fallback = await run(process.execPath, [cli, "analyze", video, "--out", join(dir, "detected"), "--json"], { cwd: dir });
    assert.equal(fallback.code, 0, fallback.stdout.toString("utf8") + fallback.stderr);
    const detected = JSON.parse(fallback.stdout.toString("utf8")) as { data: { method: string; shots: { startFrame: number; sceneId: string | null }[] } };
    assert.equal(detected.data.method, "scene-detect-0.30");
    const beatless = detected.data as typeof detected.data & { bpm: number | null; summary: { cutsOnBeat: number | null; beatHistogram: Record<string, number> }; warnings: string[] };
    assert.equal(beatless.bpm, null);
    assert.equal(beatless.summary.cutsOnBeat, null);
    assert.deepEqual(beatless.summary.beatHistogram, {});
    assert.deepEqual(beatless.warnings, ["NO_AUDIO"]);
    assert.deepEqual(detected.data.shots.map((shot) => shot.sceneId), [null, null, null]);
    assert.ok(Math.abs(detected.data.shots[1]!.startFrame - 30) <= 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

void test("timeline cuts align with generated audio clicks and create a spectrogram", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vid2-analyze-clicks-"));
  try {
    const video = join(dir, "clicks.mp4"), timeline = join(dir, "timeline.json");
    const clicks = "aevalsrc=if(lt(mod(t\\,1)\\,0.03)\\,0.8*sin(2*PI*1000*t)\\,0):s=22050:d=3";
    await runChecked("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=160x90:r=30:d=1",
      "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=30:d=1", "-f", "lavfi", "-i", "color=c=green:s=160x90:r=30:d=1",
      "-f", "lavfi", "-i", clicks, "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]",
      "-map", "[v]", "-map", "3:a", "-c:v", "mpeg4", "-q:v", "2", "-c:a", "aac", "-y", video]);
    await writeFile(timeline, JSON.stringify({ version: 1, output: { width: 160, height: 90, fps: 30 },
      beat: { bpm: 120 }, scenes: ["one", "two", "three"].map((id) => ({ id, duration: "1s" })) }));
    const result = await run(process.execPath, [cli, "analyze", video, "--timeline", timeline, "--json"], { cwd: dir });
    assert.equal(result.code, 0, result.stdout.toString("utf8") + result.stderr);
    const body = JSON.parse(result.stdout.toString("utf8")) as { data: {
      shots: { nearestOnsetDeltaMs: number | null; beats: number }[];
      cuts: { onsetDeltaMs: number | null }[];
      summary: { cutsNearOnset: number }; artifacts: { spectrogram: string | null }; warnings: string[] } };
    assert.equal(body.data.shots.length, 3);
    assert.ok(body.data.shots.every((shot) => Math.abs(shot.beats - 2) < 0.001));
    assert.ok(body.data.cuts.every((cut) => cut.onsetDeltaMs !== null && Math.abs(cut.onsetDeltaMs) <= 34),
      JSON.stringify(body.data.cuts));
    assert.equal(body.data.summary.cutsNearOnset, 2);
    assert.ok(body.data.artifacts.spectrogram);
    assert.ok(!body.data.warnings.includes("NO_AUDIO"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
