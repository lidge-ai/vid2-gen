import { decodeMono22k, onsetTimes } from "../audio/index.ts";
import { fftRadix2 } from "../audio/fft.ts";
import { probeMedia } from "../probe/index.ts";
import { runChecked, Vid2Error } from "../shared/index.ts";
import { AUDIO_BANDS } from "./types.ts";
import type { AnalyzeAudioFn, AudioAnalysis, ShotSpan } from "./types.ts";

const RATE = 22050;
const FFT_SIZE = 4096;
const HOP = FFT_SIZE / 2;
const MOMENTARY_S = 0.4;
const HANN = Float64Array.from({ length: FFT_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));
interface Moment { time: number; lufs: number }
interface Loudness { integratedLufs: number; truePeakDbtp: number; lra: number; moments: Moment[] }

function dbValue(raw: string): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : -120;
}

function summaryValue(summary: string, section: string, label: string): number {
  const body = summary.split(section)[1]?.split(/\n\s*\n/)[0] ?? "";
  const match = new RegExp(`${label}:\\s*(-?inf|[-+\\d.]+)`, "i").exec(body);
  if (!match) throw new Vid2Error("E_RENDER", `ebur128 omitted ${label}`);
  return dbValue(match[1]!);
}

async function measure(video: string, ffmpeg: string): Promise<Loudness> {
  const result = await runChecked(ffmpeg, ["-hide_banner", "-nostats", "-i", video, "-vn",
    "-af", "ebur128=peak=true", "-f", "null", "-"], { timeoutMs: 120_000 });
  const summary = result.stderr.slice(result.stderr.lastIndexOf("Summary:"));
  if (!summary.startsWith("Summary:")) throw new Vid2Error("E_RENDER", "ebur128 omitted its summary");
  const moments: Moment[] = [];
  for (const line of result.stderr.split(/\r?\n/)) {
    const match = /\bt:\s*([\d.]+).*?\bM:\s*(-?inf|[-+\d.]+)/i.exec(line);
    if (match) moments.push({ time: Number(match[1]), lufs: dbValue(match[2]!) });
  }
  if (!moments.length) throw new Vid2Error("E_RENDER", "ebur128 omitted momentary loudness");
  return { integratedLufs: summaryValue(summary, "Integrated loudness:", "I"),
    lra: summaryValue(summary, "Loudness range:", "LRA"),
    truePeakDbtp: summaryValue(summary, "True peak:", "Peak"), moments };
}

function bandShares(samples: Float32Array): AudioAnalysis["bands"] {
  const powers = new Float64Array(AUDIO_BANDS.length);
  const real = new Float64Array(FFT_SIZE); const imag = new Float64Array(FFT_SIZE);
  const frames = Math.max(1, Math.floor((samples.length - FFT_SIZE) / HOP) + 1);
  for (let frame = 0; frame < frames; frame++) {
    const offset = frame * HOP;
    for (let i = 0; i < FFT_SIZE; i++) real[i] = (samples[offset + i] ?? 0) * HANN[i]!;
    imag.fill(0); fftRadix2(real, imag);
    for (let bin = 1; bin <= FFT_SIZE / 2; bin++) {
      const hz = bin * RATE / FFT_SIZE;
      const band = AUDIO_BANDS.findIndex(({ fromHz, toHz }) => hz >= fromHz && (hz < toHz || hz === RATE / 2 && toHz === RATE / 2));
      if (band >= 0) powers[band]! += real[bin]! ** 2 + imag[bin]! ** 2;
    }
  }
  const total = powers.reduce((sum, value) => sum + value, 0);
  return AUDIO_BANDS.map((band, i) => ({ ...band, share: total > 0 ? powers[i]! / total : 0 }));
}

function shotLufs(shot: ShotSpan, moments: Moment[]): number | null {
  if (shot.endS - shot.startS < MOMENTARY_S - 1e-6) return null;
  let energy = 0; let count = 0;
  for (const moment of moments) {
    if (moment.time < shot.startS + MOMENTARY_S - 0.011 || moment.time > shot.endS + 0.011) continue;
    energy += 10 ** (moment.lufs / 10); count++;
  }
  return count ? 10 * Math.log10(Math.max(energy / count, 1e-12)) : null;
}

function hasSilentSpan(moments: Moment[]): boolean {
  let start: number | null = null; let last = 0;
  for (const moment of moments) {
    if (moment.lufs < -50) {
      if (start === null || moment.time - last > 0.16) start = moment.time;
      last = moment.time;
      if (last - start + 0.1 >= 1 - 1e-6) return true;
    } else start = null;
  }
  return false;
}

function warnings(loudness: Loudness, bands: AudioAnalysis["bands"], perShot: AudioAnalysis["perShot"]): AudioAnalysis["warnings"] {
  const out: AudioAnalysis["warnings"] = [];
  if (loudness.truePeakDbtp > -0.5) out.push("AUDIO_CLIPPING");
  const values = perShot.map((shot) => shot.lufs).filter((value): value is number => value !== null);
  if (values.length >= 6 && Math.max(...values) - Math.min(...values) < 1.5) out.push("AUDIO_FLAT_DYNAMICS");
  if (bands[0]!.share + bands[1]!.share > 0.75) out.push("AUDIO_LOW_END_DOMINANT");
  if (hasSilentSpan(loudness.moments)) out.push("AUDIO_SILENT_SPAN");
  return out;
}

/** Two-pass audio evidence: source EBU R128, then one mono PCM decode for onsets and spectrum. */
export const analyzeAudio: AnalyzeAudioFn = async ({ video, shots, ffmpeg }) => {
  if (!(await probeMedia(video)).hasAudio) return null;
  const loudness = await measure(video, ffmpeg.path);
  const samples = await decodeMono22k(video, ffmpeg.path);
  const onsets = onsetTimes(samples);
  const bands = bandShares(samples);
  const perShot = shots.map((shot) => ({ shotId: shot.id, lufs: shotLufs(shot, loudness.moments),
    onsetDensity: onsets.filter((time) => time >= shot.startS && time < shot.endS).length / (shot.endS - shot.startS) }));
  const ranked = loudness.moments.filter((moment) => moment.time >= MOMENTARY_S - 0.011);
  const series = ranked.length ? ranked : loudness.moments;
  const loudest = series.reduce((a, b) => b.lufs > a.lufs ? b : a);
  const quietest = series.reduce((a, b) => b.lufs < a.lufs ? b : a);
  return { integratedLufs: loudness.integratedLufs, truePeakDbtp: loudness.truePeakDbtp, lra: loudness.lra,
    bands, perShot, onsets, loudestS: loudest.time, quietestS: quietest.time,
    warnings: warnings(loudness, bands, perShot) };
};
