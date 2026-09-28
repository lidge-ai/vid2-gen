import { hashFile, run, Vid2Error } from "../shared/index.ts";
import { locateTools } from "../probe/index.ts";
import { fftRadix2 } from "./fft.ts";

const SAMPLE_RATE = 22050;
const N = 1024;
const HOP = 256;
const STEP = HOP / SAMPLE_RATE;
const HANN = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));

export interface BeatsFile {
  version: 1; bpm: number; offset: number; meter: number; beats: number[]; downbeats: number[];
  confidence: { tempo: number; downbeat: number }; source: { path: string; sha256: string }; method: "spectral-flux-v1";
}
interface Analysis { flux: Float64Array; low: Float64Array; duration: number }

function analyze(samples: Float32Array): Analysis {
  const frames = Math.ceil(samples.length / HOP);
  const flux = new Float64Array(frames); const low = new Float64Array(frames);
  const real = new Float64Array(N); const imag = new Float64Array(N); const previous = new Float64Array(N / 2 + 1);
  for (let frame = 0; frame < frames; frame++) {
    const center = frame * HOP;
    for (let i = 0; i < N; i++) real[i] = (samples[center + i - N / 2] ?? 0) * HANN[i]!;
    imag.fill(0); fftRadix2(real, imag);
    let sum = 0; let bass = 0;
    for (let bin = 1; bin <= N / 2; bin++) {
      const magnitude = Math.hypot(real[bin]!, imag[bin]!);
      const value = Math.log1p(100 * magnitude);
      sum += Math.max(0, value - previous[bin]!);
      previous[bin] = value;
      if (bin * SAMPLE_RATE / N <= 260) bass += magnitude;
    }
    flux[frame] = sum; low[frame] = bass;
  }
  const prefix = new Float64Array(frames + 1);
  for (let i = 0; i < frames; i++) prefix[i + 1] = prefix[i]! + flux[i]!;
  const radius = Math.round(0.1 / STEP);
  for (let i = 0; i < frames; i++) {
    const from = Math.max(0, i - radius); const to = Math.min(frames, i + radius + 1);
    flux[i] = Math.max(0, flux[i]! - (prefix[to]! - prefix[from]!) / (to - from));
  }
  return { flux, low, duration: samples.length / SAMPLE_RATE };
}

/**
 * Onset times (seconds) of mono PCM at 22 050 Hz: peaks of the spectral flux (the same analysis the beat detector uses) that are local
 * maxima within `radiusS` (default 50 ms) and exceed the mean flux by `threshold` standard deviations.
 */
export function onsetTimes(samples: Float32Array, threshold = 1.5, radiusS = 0.05): number[] {
  const { flux } = analyze(samples);
  let sum = 0; let sq = 0;
  for (const v of flux) { sum += v; sq += v * v; }
  const mean = sum / Math.max(1, flux.length);
  const sd = Math.sqrt(Math.max(0, sq / Math.max(1, flux.length) - mean * mean));
  const radius = Math.max(1, Math.round(radiusS / STEP));
  const out: number[] = [];
  for (let i = 0; i < flux.length; i++) {
    const v = flux[i]!;
    if (v <= mean + threshold * sd) continue;
    let peak = true;
    for (let j = Math.max(0, i - radius); j <= Math.min(flux.length - 1, i + radius) && peak; j++) if (flux[j]! > v || (flux[j] === v && j < i)) peak = false;
    if (peak) out.push(i * STEP);
  }
  return out;
}

export const ONSET_SAMPLE_RATE = SAMPLE_RATE;

function sampleAt(values: Float64Array, position: number): number {
  const left = Math.floor(position); const fraction = position - left;
  return (values[left] ?? 0) * (1 - fraction) + (values[left + 1] ?? 0) * fraction;
}

function tempo(flux: Float64Array): { bpm: number; confidence: number } {
  let best = { bpm: 120, score: -Infinity }; let second = -Infinity;
  const energy = flux.reduce((sum, value) => sum + value * value, 0);
  if (energy < 1e-9) throw new Vid2Error("E_INPUT", "No beat onsets found in audio");
  for (let bpm = 60; bpm <= 180; bpm += 0.5) {
    const lag = 60 / bpm / STEP;
    let score = 0;
    for (let i = 0; i + lag < flux.length; i++) score += flux[i]! * sampleAt(flux, i + lag);
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.9) ** 2);
    score = score / energy * prior;
    if (score > best.score) { second = best.score; best = { bpm, score }; }
    else if (score > second) second = score;
  }
  return { bpm: best.bpm, confidence: Math.max(0, Math.min(1, best.score * 2)) };
}

function phase(flux: Float64Array, bpm: number): number {
  const period = 60 / bpm / STEP;
  let best = { slot: 0, score: -Infinity };
  for (let slot = 0; slot < Math.ceil(period); slot++) {
    let score = 0;
    for (let at = slot; at < flux.length; at += period) score += sampleAt(flux, at);
    if (score > best.score) best = { slot, score };
  }
  const from = Math.max(0, best.slot - 2); const to = Math.min(flux.length - 1, best.slot + 2);
  let peak = best.slot;
  for (let i = from; i <= to; i++) if (flux[i]! > flux[peak]!) peak = i;
  return peak * STEP;
}


function refine(flux: Float64Array, bpm: number, initial: number): { bpm: number; offset: number } {
  const period = 60 / bpm;
  const points: { beat: number; time: number }[] = [];
  for (let beat = 0; initial + beat * period < Math.min(12, flux.length * STEP); beat++) {
    const predicted = (initial + beat * period) / STEP;
    const from = Math.max(0, Math.round(predicted - 0.09 / STEP));
    const to = Math.min(flux.length - 1, Math.round(predicted + 0.09 / STEP));
    let peak = from;
    for (let i = from + 1; i <= to; i++) if (flux[i]! > flux[peak]!) peak = i;
    if (flux[peak]! > 0) points.push({ beat, time: peak * STEP });
  }
  if (points.length < 4) return { bpm, offset: initial };
  const n = points.length;
  const sx = points.reduce((sum, p) => sum + p.beat, 0);
  const sy = points.reduce((sum, p) => sum + p.time, 0);
  const sxx = points.reduce((sum, p) => sum + p.beat * p.beat, 0);
  const sxy = points.reduce((sum, p) => sum + p.beat * p.time, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  if (slope <= 0 || Math.abs(slope - period) > period * 0.03) return { bpm, offset: initial };
  const refinedBpm = Math.round(60 / slope * 10) / 10;
  const refinedPeriod = 60 / refinedBpm;
  const start = (sy - slope * sx) / n + STEP;
  const offset = ((start % refinedPeriod) + refinedPeriod) % refinedPeriod;
  return { bpm: refinedBpm, offset: offset > refinedPeriod - 0.025 ? 0 : offset };
}

function downbeatPhase(low: Float64Array, offset: number, bpm: number): { phase: number; confidence: number } {
  const sums = [0, 0, 0, 0]; const counts = [0, 0, 0, 0];
  for (let beat = 0; ; beat++) {
    const at = (offset + beat * 60 / bpm) / STEP;
    if (at >= low.length) break;
    const index = beat % 4;
    sums[index]! += sampleAt(low, at); counts[index]!++;
  }
  const mean = sums.map((sum, i) => sum / Math.max(1, counts[i]!));
  const order = [0, 1, 2, 3].sort((a, b) => mean[b]! - mean[a]!);
  const first = mean[order[0]!]!; const second = mean[order[1]!]!;
  return { phase: order[0]!, confidence: first <= 0 || first - second < first * 0.05 ? 0.1 : Math.min(1, (first - second) / first) };
}

/** Fixed-BPM beat grid inferred from spectral flux; arrays are review data. */
export async function detectBeats(path: string, opts: { ffmpeg?: string } = {}): Promise<BeatsFile> {
  const ffmpeg = opts.ffmpeg ?? process.env["VID2_FFMPEG"] ?? locateTools().ffmpeg;
  const decoded = await run(ffmpeg, ["-v", "error", "-i", path, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "pipe:1"], { timeoutMs: 60_000 });
  if (decoded.code !== 0) throw new Vid2Error("E_INPUT", `Cannot decode audio for beat detection: ${path}`, {
    details: { stderrTail: decoded.stderr.slice(-1000) } });
  const bytes = decoded.stdout;
  if (bytes.length < SAMPLE_RATE * 4 || bytes.length % 4) throw new Vid2Error("E_INPUT", "Beat detection needs at least one second of decoded audio");
  const samples = new Float32Array(bytes.length / 4);
  for (let i = 0; i < samples.length; i++) samples[i] = bytes.readFloatLE(i * 4);
  const { flux, low, duration } = analyze(samples);
  const estimate = tempo(flux);
  const refined = refine(flux, estimate.bpm, phase(flux, estimate.bpm));
  const offset = refined.offset;
  const downbeat = downbeatPhase(low, offset, refined.bpm);
  const beats: number[] = []; const downbeats: number[] = [];
  for (let k = 0; ; k++) {
    const time = offset + k * 60 / refined.bpm;
    if (time >= duration) break;
    beats.push(time);
    if (k % 4 === downbeat.phase) downbeats.push(time);
  }
  return { version: 1, bpm: refined.bpm, offset, meter: 4, beats, downbeats,
    confidence: { tempo: estimate.confidence, downbeat: downbeat.confidence },
    source: { path, sha256: await hashFile(path) }, method: "spectral-flux-v1" };
}
