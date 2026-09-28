import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { quoteExpr } from "../compile/escape.ts";
import { locateTools } from "../probe/index.ts";
import type { FfmpegInfo } from "../probe/index.ts";
import { runChecked } from "../shared/index.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";
import { analyzeAudio } from "./audio.ts";
import type { ShotSpan } from "./types.ts";

function spans(ends: number[]): ShotSpan[] {
  return ends.map((endS, i) => ({ id: `shot-${i + 1}`, startFrame: Math.round((ends[i - 1] ?? 0) * 30),
    endFrame: Math.round(endS * 30), startS: ends[i - 1] ?? 0, endS }));
}

async function fixture(ffmpeg: string, path: string, expr: string, seconds: number): Promise<void> {
  await runChecked(ffmpeg, ["-v", "error", "-f", "lavfi", "-i",
    `aevalsrc=exprs=${quoteExpr(expr)}:s=48000:d=${seconds}`, "-c:a", "pcm_s16le", "-y", path]);
}

test("two-pass analysis resolves a 6 dB shot change and 440 Hz band", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ffmpeg } = locateTools();
  const dir = mkdtempSync(join(tmpdir(), "vid2-analyze-audio-"));
  try {
    const path = join(dir, "tone.wav");
    await fixture(ffmpeg, path, "0.1*sin(2*PI*440*t)*if(lt(t,2),1,1.995262)", 4);
    const result = await analyzeAudio({ video: path, shots: spans([2, 4]), ffmpeg: { path: ffmpeg } as FfmpegInfo });
    assert.ok(result);
    const [first, second] = result.perShot;
    assert.ok(first?.lufs !== null && first?.lufs !== undefined);
    assert.ok(second?.lufs !== null && second?.lufs !== undefined);
    assert.ok(Math.abs((second.lufs - first.lufs) - 6) <= 0.5, `LU delta ${second.lufs - first.lufs}`);
    const band = result.bands.find((item) => item.name === "lowMid");
    assert.ok(band && band.share > 0.9, `lowMid share ${band?.share}`);
    assert.ok(Number.isFinite(result.integratedLufs));
    assert.ok(Number.isFinite(result.truePeakDbtp));
    assert.ok(Number.isFinite(result.lra));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("video without audio returns null", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ffmpeg } = locateTools();
  const dir = mkdtempSync(join(tmpdir(), "vid2-analyze-muted-"));
  try {
    const path = join(dir, "muted.mp4");
    await runChecked(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=30:d=1",
      "-c:v", "mpeg4", "-an", "-y", path]);
    assert.equal(await analyzeAudio({ video: path, shots: spans([1]), ffmpeg: { path: ffmpeg } as FfmpegInfo }), null);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("click onsets land within 34 ms and a short shot has null LUFS", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ffmpeg } = locateTools();
  const dir = mkdtempSync(join(tmpdir(), "vid2-analyze-clicks-"));
  try {
    const path = join(dir, "clicks.wav");
    const clicks = [0.5, 1, 1.5, 2.25];
    const pulses = clicks.map((at) => `if(between(t,${at},${at + 0.006}),0.8*sin(2*PI*2800*t),0)`).join("+");
    await fixture(ffmpeg, path, pulses, 3);
    const result = await analyzeAudio({ video: path, shots: spans([0.2, 1.5, 3]), ffmpeg: { path: ffmpeg } as FfmpegInfo });
    assert.ok(result);
    for (const click of clicks) assert.ok(result.onsets.some((time) => Math.abs(time - click) <= 0.034),
      `missing ${click}: ${result.onsets.join(", ")}`);
    assert.equal(result.perShot[0]?.lufs, null);
    assert.ok(result.perShot[1]!.onsetDensity > 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("steady bass and a quiet span produce the corresponding warnings", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ffmpeg } = locateTools();
  const dir = mkdtempSync(join(tmpdir(), "vid2-analyze-warnings-"));
  try {
    const bass = join(dir, "bass.wav");
    await fixture(ffmpeg, bass, "0.95*sin(2*PI*100*t)", 6);
    const measured = await analyzeAudio({ video: bass, shots: spans([1, 2, 3, 4, 5, 6]),
      ffmpeg: { path: ffmpeg } as FfmpegInfo });
    assert.ok(measured);
    assert.ok(measured.warnings.includes("AUDIO_CLIPPING"));
    assert.ok(measured.warnings.includes("AUDIO_FLAT_DYNAMICS"));
    assert.ok(measured.warnings.includes("AUDIO_LOW_END_DOMINANT"));
    const quiet = join(dir, "quiet.wav");
    await fixture(ffmpeg, quiet, "if(lt(t,1.5),0,0.1*sin(2*PI*440*t))", 3);
    const quietResult = await analyzeAudio({ video: quiet, shots: spans([1.5, 3]),
      ffmpeg: { path: ffmpeg } as FfmpegInfo });
    assert.ok(quietResult?.warnings.includes("AUDIO_SILENT_SPAN"));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
