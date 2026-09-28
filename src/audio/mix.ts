import { copyFile, mkdir, rename, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import type { AudioPlan, AudioRender, AudioStem } from "../compile/ir.ts";
import { cacheDir, hashJson, runChecked, Vid2Error } from "../shared/index.ts";

const RATE = 48_000;

function stemFilters(stem: AudioStem, index: number, durationSamples: number): string {
  const samples = [stem.atSample, stem.skipSamples ?? 0, stem.trimSamples ?? 0, stem.fadeOutSamples ?? 0];
  if (samples.some((value) => !Number.isInteger(value) || value < 0) || !Number.isFinite(stem.gain) || stem.gain < 0) {
    throw new Vid2Error("E_INPUT", `Invalid audio stem ${stem.id}`);
  }
  const parts = ["aresample=48000", "aformat=channel_layouts=stereo"];
  const start = stem.skipSamples ?? 0;
  const end = stem.trimSamples === undefined ? "" : `:end_sample=${start + stem.trimSamples}`;
  parts.push(`atrim=start_sample=${start}${end}`, "asetpts=PTS-STARTPTS");
  if (stem.role === "music" && stem.fadeOutSamples && stem.fadeOutSamples > 0) {
    const length = Math.max(0, (stem.trimSamples ?? durationSamples - stem.atSample));
    parts.push(`afade=t=out:ss=${Math.max(0, length - stem.fadeOutSamples)}:ns=${stem.fadeOutSamples}`);
  }
  parts.push(`volume=${stem.gain}`, `adelay=delays=${stem.atSample}S:all=1`,
    `apad=whole_len=${durationSamples}`, `atrim=end_sample=${durationSamples}`, "asetpts=PTS-STARTPTS");
  return `[${index}:a]${parts.join(",")}[stem${index}]`;
}

function mixBus(labels: string[], out: string): string {
  if (labels.length === 1) return `${labels[0]}anull[${out}]`;
  return `${labels.join("")}amix=inputs=${labels.length}:duration=longest:normalize=0:weights='${labels.map(() => "1").join(" ")}'[${out}]`;
}

/** Per-stem sample placement, optional voice-key ducking, explicit weights and glue limiting. */
export function mixGraph(stems: AudioStem[], opts: { durationSamples: number; duck: boolean }): string {
  if (!Number.isInteger(opts.durationSamples) || opts.durationSamples < 1) throw new Vid2Error("E_INPUT", "Invalid audio duration");
  if (!stems.length) return `anullsrc=r=${RATE}:cl=stereo,atrim=end_sample=${opts.durationSamples}[apre]`;
  const chains = stems.map((stem, i) => stemFilters(stem, i, opts.durationSamples));
  const music = stems.flatMap((stem, i) => stem.role === "music" ? [`[stem${i}]`] : []);
  const voice = stems.flatMap((stem, i) => stem.role === "voice" ? [`[stem${i}]`] : []);
  const others = stems.flatMap((stem, i) => stem.role !== "music" && stem.role !== "voice" ? [`[stem${i}]`] : []);
  let inputs: string[];
  if (opts.duck && music.length && voice.length) {
    chains.push(mixBus(music, "musicbus"), mixBus(voice, "voicebus"),
      "[voicebus]asplit=2[voicekey][voiceout]",
      "[musicbus][voicekey]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[ducked]");
    inputs = ["[ducked]", "[voiceout]", ...others];
  } else inputs = stems.map((_, i) => `[stem${i}]`);
  // Gentle 2:1 glue that only catches peaks, so a pre-mastered music file keeps its build/drop dynamics; the limiter runs
  // 4x oversampled so sharp cue transients cannot leave inter-sample peaks that push loudnorm out of linear mode.
  chains.push(mixBus(inputs, "mixed"),
    "[mixed]acompressor=threshold=0.25:ratio=2:attack=10:release=150:makeup=1.4," +
    `aresample=${RATE * 4},alimiter=limit=0.7:level=false:latency=true,aresample=${RATE}[apre]`);
  return chains.join(";");
}

async function exists(path: string): Promise<boolean> {
  try { return (await stat(path)).size > 44; } catch { return false; }
}

/** Materialize generated synth/SFX WAVs once per content hash. */
export async function materializeRenders(renders: AudioRender[], opts: { ffmpeg: string }): Promise<void> {
  const dir = cacheDir("audio-renders");
  for (const render of renders) {
    const key = hashJson({ hash: render.hash, args: render.args });
    const cached = join(dir, `${key}.wav`);
    await mkdir(dirname(render.out), { recursive: true });
    if (!await exists(cached)) {
      const tmp = join(dir, `${key}.${process.pid}.tmp.wav`);
      await runChecked(opts.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...render.args,
        "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", tmp]);
      await rename(tmp, cached);
    }
    await copyFile(cached, render.out);
  }
}

function runMix(ffmpeg: string, args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    if (signal?.aborted) { reject(new Vid2Error("E_INTERRUPTED", "Audio mix interrupted")); return; }
    const child = spawn(ffmpeg, args, { signal, windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4096); });
    child.on("error", (cause) => reject(new Vid2Error(signal?.aborted ? "E_INTERRUPTED" : "E_RENDER", "Audio mix failed", { cause })));
    child.on("close", (code) => code === 0 ? resolvePromise() : reject(new Vid2Error(
      signal?.aborted ? "E_INTERRUPTED" : "E_RENDER", "Audio mix failed", { details: { code, stderr } })));
  });
}

/** Render a 48 kHz stereo premaster from local stems; no providers run here. */
export async function premaster(plan: AudioPlan, opts: { ffmpeg: string; signal?: AbortSignal }): Promise<string> {
  if (plan.sampleRate !== RATE) throw new Vid2Error("E_INPUT", "AudioPlan must use 48000 Hz");
  if (opts.signal?.aborted) throw new Vid2Error("E_INTERRUPTED", "Audio mix interrupted");
  await materializeRenders(plan.renders, { ffmpeg: opts.ffmpeg });
  if (opts.signal?.aborted) throw new Vid2Error("E_INTERRUPTED", "Audio mix interrupted");
  await mkdir(dirname(plan.premaster), { recursive: true });
  const graph = plan.graph || mixGraph(plan.stems, { durationSamples: plan.durationSamples, duck: plan.duck });
  await runMix(opts.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...plan.stems.flatMap((stem) => ["-i", stem.path]),
    "-filter_complex", graph, "-map", "[apre]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", plan.premaster], opts.signal);
  return plan.premaster;
}
