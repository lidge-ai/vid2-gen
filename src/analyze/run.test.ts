import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { probeFfmpeg } from "../probe/index.ts";
import { runChecked } from "../shared/index.ts";
import { runAnalyze } from "./run.ts";

void test("required capabilities fail before analysis", async () => {
  const info = await probeFfmpeg();
  await assert.rejects(runAnalyze({ video: "/missing", ffmpeg: { ...info, filters: new Set() }, ffprobe: "ffprobe",
    analyzeAudio: async () => null }), { code: "E_CAPABILITY" });
});

void test("no audio leaves onset/spectrogram null; absent spectrogram capability warns only with audio", async () => {
  const dir = await mkdtemp(join(tmpdir(), "vid2-analyze-"));
  try {
    const video = join(dir, "silent.mp4");
    await runChecked("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=red:s=160x90:r=10:d=1",
      "-c:v", "mpeg4", "-y", video]);
    const info = await probeFfmpeg();
    const missing = { ...info, filters: new Set([...info.filters].filter((name) => name !== "showspectrumpic")) };
    const report = await runAnalyze({ video, out: join(dir, "out"), ffmpeg: missing, ffprobe: "ffprobe",
      analyzeAudio: async () => null });
    assert.deepEqual(report.warnings, ["NO_AUDIO"]);
    assert.equal(report.artifacts.spectrogram, null);
    assert.equal(report.shots[0]?.nearestOnsetDeltaMs, null);
    assert.equal(report.summary.cutsNearOnset, null);
    const withAudio = await runAnalyze({ video, out: join(dir, "with-audio"), ffmpeg: missing, ffprobe: "ffprobe",
      analyzeAudio: async () => ({ integratedLufs: -20, truePeakDbtp: -1, lra: 2, bands: [], perShot: [],
        onsets: [0], loudestS: 0, quietestS: 0, warnings: [] }) });
    assert.equal(withAudio.artifacts.spectrogram, null);
    assert.deepEqual(withAudio.warnings, ["SPECTROGRAM_UNAVAILABLE"]);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
