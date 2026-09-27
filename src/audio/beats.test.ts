import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { quoteExpr } from "../compile/escape.ts";
import { locateTools } from "../probe/index.ts";
import { runChecked } from "../shared/index.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";
import { detectBeats } from "./beats.ts";

async function clickTrack(ffmpeg: string, path: string, bpm: number, duration: number): Promise<void> {
  const period = 60 / bpm;
  const expr = `gte(t,0.25)*if(lt(mod(t-0.25,${period}),0.005),0.8,0)`;
  await runChecked(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", `aevalsrc=exprs=${quoteExpr(expr)}:s=48000:d=${duration}`,
    "-c:a", "pcm_s16le", "-y", path]);
}

void test("spectral-flux detector resolves 100, 120, 140 BPM and first beat", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ffmpeg } = locateTools();
  const dir = mkdtempSync(join(tmpdir(), "vid2-beats-"));
  try {
    for (const bpm of [100, 120, 140]) {
      const path = join(dir, `${bpm}.wav`);
      await clickTrack(ffmpeg, path, bpm, 12);
      const result = await detectBeats(path, { ffmpeg });
      assert.ok(Math.abs(result.bpm - bpm) <= 1, `${bpm} became ${result.bpm}`);
      assert.ok(Math.abs(result.offset - 0.25) <= 0.02, `first beat ${result.offset}`);
      assert.equal(result.source.path, path);
      assert.match(result.source.sha256, /^[a-f0-9]{64}$/);
      assert.equal(result.method, "spectral-flux-v1");
      assert.ok(result.beats.length >= 10);
      assert.ok(result.downbeats.length >= 2);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

void test("60-second beat analysis completes in under two seconds", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ffmpeg } = locateTools();
  const dir = mkdtempSync(join(tmpdir(), "vid2-beats-long-"));
  try {
    const path = join(dir, "60s.wav");
    await clickTrack(ffmpeg, path, 120, 60);
    const started = performance.now();
    const result = await detectBeats(path, { ffmpeg });
    const elapsed = performance.now() - started;
    // Target is 2 s on a developer machine; shared CI runners (Windows especially) run tests in parallel and get 3x headroom.
    const limit = process.env["CI"] ? 6000 : 2000;
    assert.ok(elapsed < limit, `analysis took ${elapsed.toFixed(0)} ms (limit ${limit})`);
    assert.ok(Math.abs(result.bpm - 120) <= 1);
    assert.ok(Math.abs(result.offset - 0.25) <= 0.02);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

void test("silent audio does not invent a tempo", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ffmpeg } = locateTools();
  const dir = mkdtempSync(join(tmpdir(), "vid2-beats-silent-"));
  try {
    const path = join(dir, "silence.wav");
    await runChecked(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=2",
      "-c:a", "pcm_s16le", "-y", path]);
    await assert.rejects(detectBeats(path, { ffmpeg }), { code: "E_INPUT" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
