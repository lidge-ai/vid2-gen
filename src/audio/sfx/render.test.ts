import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { run } from "../../shared/exec.ts";
import { requireFfmpeg, tempDir } from "../../../tests/helpers.ts";
import { anchorStart, AUDIO_RATE } from "../cues.ts";
import { SFX_PRESETS } from "./presets.ts";
import type { SfxName } from "./presets.ts";
import { sfxArgs } from "./render.ts";

const ffmpeg = process.env["VID2_FFMPEG"] ?? "ffmpeg";
const ffprobe = process.env["VID2_FFPROBE"] ?? "ffprobe";

async function wav(name: SfxName): Promise<string> {
  const path = join(tempDir("vid2-sfx-"), `${name}.wav`);
  const result = await run(ffmpeg, sfxArgs(name, path));
  assert.equal(result.code, 0, result.stderr);
  return path;
}

async function pcm(path: string, filter?: string): Promise<Float32Array> {
  const result = await run(ffmpeg, ["-hide_banner", "-v", "error", "-i", path,
    ...(filter ? ["-af", filter] : []), "-ac", "1", "-ar", "48000", "-f", "f32le", "-"]);
  assert.equal(result.code, 0, result.stderr);
  const samples = new Float32Array(result.stdout.length / 4);
  for (let i = 0; i < samples.length; i++) samples[i] = result.stdout.readFloatLE(i * 4);
  return samples;
}

function absolutePeak(samples: Float32Array): { index: number; value: number } {
  let index = 0, value = 0;
  for (let i = 0; i < samples.length; i++) {
    const amplitude = Math.abs(samples[i]!);
    if (amplitude > value) { index = i; value = amplitude; }
  }
  return { index, value };
}

function rms(samples: Float32Array, startS: number, endS: number): number {
  const start = Math.round(startS * AUDIO_RATE), end = Math.min(samples.length, Math.round(endS * AUDIO_RATE));
  let power = 0;
  for (let i = start; i < end; i++) power += samples[i]! ** 2;
  return Math.sqrt(power / Math.max(1, end - start));
}

void test("all SFX presets render exact-length audible 48 kHz stereo WAVs with anchored peaks", async (t) => {
  if (!requireFfmpeg(t)) return;
  for (const name of Object.keys(SFX_PRESETS) as SfxName[]) {
    const path = await wav(name);
    const info = await run(ffprobe, ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels",
      "-of", "json", path]);
    assert.equal(info.code, 0, info.stderr);
    const stream = (JSON.parse(info.stdout.toString()) as { streams: { sample_rate: string; channels: number }[] }).streams[0]!;
    assert.deepEqual(stream, { sample_rate: "48000", channels: 2 });
    const samples = await pcm(path);
    const preset = SFX_PRESETS[name];
    assert.equal(samples.length, Math.round(preset.durationS * AUDIO_RATE), `${name} length`);
    const peak = absolutePeak(samples);
    assert.ok(peak.value > 0.03, `${name} silent: ${peak.value}`);
    assert.ok(peak.value < 1, `${name} clipped: ${peak.value}`);
    assert.ok(rms(samples, 0, preset.durationS) > 0.003, `${name} has no sustained audible energy`);
    assert.ok(Math.abs(peak.index - Math.round(preset.peakS * AUDIO_RATE)) <= 96,
      `${name} peak at ${peak.index / AUDIO_RATE}s, expected ${preset.peakS}s`);
  }
});

void test("whoosh and riser swell, while impact decays", async (t) => {
  if (!requireFfmpeg(t)) return;
  const whoosh = await pcm(await wav("whoosh"));
  assert.ok(rms(whoosh, 0.31, 0.38) > rms(whoosh, 0.02, 0.09) * 3);
  assert.ok(rms(whoosh, 0.31, 0.38) > rms(whoosh, 0.68, 0.75) * 1.5);
  const riser = await pcm(await wav("riser"));
  assert.ok(rms(riser, 1.08, 1.16) > rms(riser, 0.1, 0.18) * 3);
  const impact = await pcm(await wav("impact"));
  assert.ok(rms(impact, 0, 0.04) > rms(impact, 0.55, 0.65) * 3);
});

void test("start, peak and end anchors land on a known cut within 2 ms in decoded PCM", async (t) => {
  if (!requireFfmpeg(t)) return;
  const cut = 2 * AUDIO_RATE;
  for (const name of ["click", "whoosh", "riser"] as const) {
    const preset = SFX_PRESETS[name];
    const path = await wav(name);
    const start = anchorStart(cut, preset);
    const samples = await pcm(path, `adelay=delays=${start}S:all=1,apad=whole_len=${cut + AUDIO_RATE},atrim=end_sample=${cut + AUDIO_RATE}`);
    if (preset.anchor === "peak") {
      assert.ok(Math.abs(absolutePeak(samples).index - cut) <= 96);
    } else if (preset.anchor === "end") {
      let last = -1;
      for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]!) > 0.001) last = i;
      assert.ok(Math.abs(last - cut) <= 96, `${name} end at ${last}`);
    } else {
      let first = -1;
      for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]!) > 0.001) { first = i; break; }
      assert.ok(Math.abs(first - cut) <= 96, `${name} onset at ${first}`);
    }
  }
});
