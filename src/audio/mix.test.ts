import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import type { AudioPlan, AudioStem } from "../compile/ir.ts";
import { runChecked } from "../shared/index.ts";
import { requireFfmpeg, tempDir } from "../../tests/helpers.ts";
import { materializeRenders, mixGraph, premaster } from "./mix.ts";

const RATE = 48_000;
const ffmpeg = () => process.env["VID2_FFMPEG"] ?? "ffmpeg";

async function tone(path: string, hz: number, seconds: number): Promise<void> {
  await runChecked(ffmpeg(), ["-v", "error", "-y", "-f", "lavfi", "-i",
    `sine=frequency=${hz}:sample_rate=${RATE}:duration=${seconds}`, "-ac", "2", "-c:a", "pcm_s24le", path]);
}

function plan(stems: AudioStem[], path: string, duck: boolean): AudioPlan {
  const durationSamples = 3 * RATE;
  return { version: 1, sampleRate: RATE, durationSamples, renders: [], stems,
    graph: mixGraph(stems, { durationSamples, duck }), duck, target: { I: -14, TP: -1, LRA: 11 }, codec: "aac",
    premaster: path, master: path.replace("pre.wav", "master.wav"), provenance: [] };
}

async function pcm(path: string): Promise<Float32Array> {
  const result = await runChecked(ffmpeg(), ["-v", "error", "-i", path, "-ac", "1", "-ar", String(RATE),
    "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1"]);
  return new Float32Array(result.stdout.buffer.slice(result.stdout.byteOffset,
    result.stdout.byteOffset + result.stdout.byteLength));
}

function amplitude(samples: Float32Array, hz: number, second: number): number {
  const start = Math.round(second * RATE);
  const count = Math.round(0.2 * RATE);
  let real = 0;
  let imaginary = 0;
  for (let i = 0; i < count; i++) {
    const angle = 2 * Math.PI * hz * i / RATE;
    real += samples[start + i]! * Math.cos(angle);
    imaginary += samples[start + i]! * Math.sin(angle);
  }
  return 2 * Math.hypot(real, imaginary) / count;
}

test("mix graph uses explicit unnormalized weights and sample units", () => {
  const graph = mixGraph([{ id: "a", role: "music", path: "a.wav", atSample: 2400, trimSamples: 4800, gain: 0.7 },
    { id: "b", role: "sfx", path: "b.wav", atSample: 0, gain: 1 }], { durationSamples: RATE, duck: false });
  assert.match(graph, /adelay=delays=2400S:all=1/);
  assert.match(graph, /atrim=start_sample=0:end_sample=4800/);
  assert.match(graph, /amix=inputs=2:duration=longest:normalize=0:weights='1 1'/);
  assert.doesNotMatch(graph, /c=same/);
  assert.ok([...graph.matchAll(/adelay=delays=([^:]+)/g)].every((match) => match[1]?.endsWith("S")));
});

test("placed cue starts at its planned sample and voice ducks music", async (t) => {
  if (!requireFfmpeg(t)) return;
  const root = tempDir("vid2-mix-");
  const music = join(root, "music.wav");
  const voice = join(root, "voice.wav");
  await Promise.all([tone(music, 220, 3), tone(voice, 880, 1)]);
  const stems: AudioStem[] = [
    { id: "m", role: "music", path: music, atSample: 0, gain: 1 },
    { id: "v", role: "voice", path: voice, atSample: RATE, gain: 1 },
  ];
  const output = await premaster(plan(stems, join(root, "pre.wav"), true), { ffmpeg: ffmpeg() });
  const samples = await pcm(output);
  const before = amplitude(samples, 220, 0.5);
  const during = amplitude(samples, 220, 1.5);
  const after = amplitude(samples, 220, 2.7);
  assert.ok(during < before * 0.75, `music did not duck: ${before}, ${during}`);
  assert.ok(after > during * 1.5, `music did not recover: ${during}, ${after}`);
  const cueOnly = await premaster(plan([{ id: "cue", role: "sfx", path: voice, atSample: 4800,
    trimSamples: 2400, gain: 1 }], join(root, "cue-pre.wav"), false), { ffmpeg: ffmpeg() });
  const cue = await pcm(cueOnly);
  const onset = cue.findIndex((value) => Math.abs(value) > 0.001);
  assert.ok(Math.abs(onset - 4800) <= 10, `cue started at sample ${onset}`);
});

test("SFX remains audible at full level during the music fade", async (t) => {
  if (!requireFfmpeg(t)) return;
  const root = tempDir("vid2-fade-");
  const music = join(root, "music.wav");
  const sfx = join(root, "sfx.wav");
  await Promise.all([tone(music, 220, 3), tone(sfx, 1760, 0.5)]);
  const cue: AudioStem = { id: "cue", role: "sfx", path: sfx, atSample: Math.round(2.3 * RATE), gain: 1 };
  const mixed = await premaster(plan([{ id: "m", role: "music", path: music, atSample: 0,
    fadeOutSamples: RATE, gain: 1 }, cue], join(root, "pre.wav"), false), { ffmpeg: ffmpeg() });
  const only = await premaster(plan([cue], join(root, "cue-pre.wav"), false), { ffmpeg: ffmpeg() });
  const a = amplitude(await pcm(mixed), 1760, 2.5);
  const b = amplitude(await pcm(only), 1760, 2.5);
  assert.ok(a > b * 0.7, `SFX faded with music: ${a} vs ${b}`);
});

test("unnormalized weights increase an audible two-stem mix", async (t) => {
  if (!requireFfmpeg(t)) return;
  const root = tempDir("vid2-weights-");
  const source = join(root, "tone.wav");
  await tone(source, 330, 3);
  const stem: AudioStem = { id: "one", role: "sfx", path: source, atSample: 0, gain: 1 };
  const single = await premaster(plan([stem], join(root, "single-pre.wav"), false), { ffmpeg: ffmpeg() });
  const double = await premaster(plan([stem, { ...stem, id: "two" }], join(root, "double-pre.wav"), false), { ffmpeg: ffmpeg() });
  const one = amplitude(await pcm(single), 330, 0.5);
  const two = amplitude(await pcm(double), 330, 0.5);
  assert.ok(two > one * 1.2, `mix weights were normalized: ${one} vs ${two}`);
});

test("generated audio render is cached at 48 kHz", async (t) => {
  if (!requireFfmpeg(t)) return;
  const root = tempDir("vid2-render-cache-");
  const out = join(root, "synth.wav");
  const render = { id: "test", kind: "synth" as const, args: ["-f", "lavfi", "-i",
    "sine=frequency=330:sample_rate=48000:duration=0.2"], out, hash: root };
  await materializeRenders([render], { ffmpeg: ffmpeg() });
  const first = await pcm(out);
  assert.ok(first.length >= 9500);
  await materializeRenders([render], { ffmpeg: "nonexistent-ffmpeg" });
  assert.deepEqual(await pcm(out), first);
});
