import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { locateTools } from "../../probe/index.ts";
import { runChecked } from "../../shared/index.ts";
import { requireFfmpeg } from "../../../tests/helpers.ts";
import { detectBeats } from "../beats.ts";
import { SYNTH_PRESETS, synthArgs } from "./engine.ts";

async function pcm(ffmpeg: string, path: string, filter = "anull", channels = 1): Promise<Float32Array> {
  const decoded = await runChecked(ffmpeg, ["-v", "error", "-i", path, "-af", filter, "-ac", String(channels),
    "-ar", "48000", "-f", "f32le", "pipe:1"]);
  const data = new Float32Array(decoded.stdout.length / 4);
  for (let i = 0; i < data.length; i++) data[i] = decoded.stdout.readFloatLE(i * 4);
  return data;
}
function levels(samples: Float32Array): { rms: number; peak: number } {
  let square = 0; let peak = 0;
  for (const value of samples) { square += value * value; peak = Math.max(peak, Math.abs(value)); }
  return { rms: Math.sqrt(square / samples.length), peak };
}
function windows(samples: Float32Array, size = 240): number[] {
  const bins: number[] = [];
  for (let start = 0; start + size <= samples.length; start += size) bins.push(levels(samples.subarray(start, start + size)).rms);
  return bins;
}

void test("launch renders exact 48 kHz stereo audio with audible low/high bands and beat-aligned kicks", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ffmpeg } = locateTools();
  const dir = mkdtempSync(join(tmpdir(), "vid2-synth-launch-"));
  try {
    const path = join(dir, "launch.wav");
    const args = synthArgs({ preset: "launch", key: "Am", bpm: 120, durationS: 6, seed: 7 }, path);
    const graph = args[args.indexOf("-filter_complex") + 1]!;
    assert.match(graph, /sidechaincompress/);
    assert.match(graph, /afir=gtype=peak/);
    assert.doesNotMatch(graph, /c=same/);
    assert.ok([...graph.matchAll(/amix=/g)].length >= 2);
    assert.equal([...graph.matchAll(/amix=[^;]+/g)].every((match) => match[0].includes("normalize=0")), true);
    await runChecked(ffmpeg, args);
    const stereo = await pcm(ffmpeg, path, "anull", 2);
    assert.equal(stereo.length, 6 * 48000 * 2);
    const overall = levels(stereo);
    assert.ok(overall.rms > 0.01, `quiet RMS ${overall.rms}`);
    assert.ok(overall.peak < 0.99, `clipped peak ${overall.peak}`);
    const lowPcm = await pcm(ffmpeg, path, "lowpass=f=180");
    const low = levels(lowPcm).rms;
    const bandWindow = (start: number, end: number) => levels(lowPcm.subarray(Math.round(start * 48000), Math.round(end * 48000))).rms;
    assert.ok(bandWindow(2.2, 2.6) > bandWindow(0.2, 0.6) * 1.5, "drop should hit harder than intro");
    assert.ok(bandWindow(5.3, 5.7) < bandWindow(2.2, 2.6), "outro should decay after drop");
    const high = levels(await pcm(ffmpeg, path, "highpass=f=3000")).rms;
    assert.ok(low > 0.005 && high > 0.0005, `spectral balance low=${low}, high=${high}`);
    const bins = windows(await pcm(ffmpeg, path, "lowpass=f=120"));
    for (let beat = 0; beat < 10; beat++) {
      const center = beat * 100; // 5 ms RMS bins at 120 BPM
      const previous = bins.slice(Math.max(0, center - 4), center);
      const baseline = previous.reduce((sum, value) => sum + value, 0) / Math.max(1, previous.length);
      const onset = [0, 1, 2].find((delta) => bins[center + delta]! > baseline + 0.01);
      assert.ok(onset !== undefined && onset * 5 <= 10, `kick ${beat} onset missed beat by >10 ms`);
    }
    const beats = await detectBeats(path, { ffmpeg });
    assert.ok(Math.abs(beats.bpm - 120) <= 1, `synth BPM detected as ${beats.bpm}`);
    const ebur = await runChecked(ffmpeg, ["-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"]);
    const values = [...ebur.stderr.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
    assert.ok(values.length > 0 && Number.isFinite(Number(values.at(-1)?.[1])));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

void test("minimal and tech presets are audible; none is exact silent length", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ffmpeg } = locateTools();
  assert.deepEqual(SYNTH_PRESETS, ["launch", "minimal", "tech", "none"]);
  const dir = mkdtempSync(join(tmpdir(), "vid2-synth-presets-"));
  try {
    for (const preset of SYNTH_PRESETS) {
      const path = join(dir, `${preset}.wav`);
      await runChecked(ffmpeg, synthArgs({ preset, key: "C", bpm: 100, durationS: 1.25 }, path));
      const samples = await pcm(ffmpeg, path, "anull", 2);
      assert.equal(samples.length, 60000 * 2);
      const level = levels(samples);
      if (preset === "none") assert.equal(level.peak, 0);
      else { assert.ok(level.rms > 0.001, `${preset} is silent`); assert.ok(level.peak < 0.99); }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
