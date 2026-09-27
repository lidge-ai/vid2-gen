import { Vid2Error } from "../../shared/errors.ts";
import { num, quoteExpr } from "../../compile/escape.ts";
import { SFX_PRESETS } from "./presets.ts";
import type { SfxName } from "./presets.ts";

interface ToneShape { lowHz: number; highHz: number; noiseLow: number; noiseHigh: number; body: number; tail: number }
const SHAPES: Record<SfxName, ToneShape> = {
  whoosh: { lowHz: 170, highHz: 840, noiseLow: 650, noiseHigh: 3200, body: 0.16, tail: 6 },
  riser: { lowHz: 180, highHz: 1800, noiseLow: 950, noiseHigh: 4800, body: 0.2, tail: 0 },
  click: { lowHz: 1500, highHz: 700, noiseLow: 1200, noiseHigh: 4800, body: 0.12, tail: 65 },
  impact: { lowHz: 140, highHz: 42, noiseLow: 180, noiseHigh: 3500, body: 0.42, tail: 9 },
  pop: { lowHz: 500, highHz: 140, noiseLow: 350, noiseHigh: 2400, body: 0.3, tail: 22 },
  type: { lowHz: 2400, highHz: 1200, noiseLow: 1700, noiseHigh: 5600, body: 0.1, tail: 85 },
  "swoosh-up": { lowHz: 260, highHz: 1300, noiseLow: 900, noiseHigh: 4000, body: 0.16, tail: 7 },
  shimmer: { lowHz: 660, highHz: 1400, noiseLow: 1800, noiseHigh: 6000, body: 0.18, tail: 3 },
};

function envelope(name: SfxName, duration: number, peak: number): string {
  const t = "t";
  if (name === "riser") return `pow(${t}/${num(duration)},2)`;
  if (name === "whoosh" || name === "swoosh-up") {
    return `if(lt(${t},${num(peak)}),pow(${t}/${num(peak)},1.7),exp(-6*(${t}-${num(peak)})))`;
  }
  if (name === "shimmer") return `if(lt(${t},${num(peak)}),${t}/${num(peak)},exp(-3*(${t}-${num(peak)})))`;
  return `exp(-${num(SHAPES[name].tail)}*${t})`;
}

function toneExpression(name: SfxName): string {
  const preset = SFX_PRESETS[name];
  const shape = SHAPES[name];
  const d = num(preset.durationS), p = num(preset.peakS);
  const phase = `2*PI*(${num(shape.lowHz)}*t+${num(shape.highHz - shape.lowHz)}*t*t/(2*${d}))`;
  const body = `${num(shape.body)}*sin(${phase})*${envelope(name, preset.durationS, preset.peakS)}`;
  const accent = `0.85*sin(2*PI*1700*t)*exp(-pow((t-${p})/0.0012,2))`;
  return `${body}+${accent}`;
}

function graph(name: SfxName): string {
  const preset = SFX_PRESETS[name];
  const shape = SHAPES[name];
  const d = preset.durationS, p = preset.peakS;
  const env = envelope(name, d, p);
  const balance = name === "whoosh" || name === "swoosh-up" || name === "riser"
    ? [`aeval=exprs=${quoteExpr(`val(0)*(${env})*(1-t/${num(d)})`)}`,
      `aeval=exprs=${quoteExpr(`val(0)*(${env})*(t/${num(d)})`)}`]
    : [`aeval=exprs=${quoteExpr(`val(0)*(${env})`)}`, `aeval=exprs=${quoteExpr(`val(0)*(${env})`)}`];
  const length = Math.round(d * 48000);
  return `[0:a]asplit=2[n0][n1];` +
    `[n0]bandpass=f=${num(shape.noiseLow)}:width_type=h:width=1,${balance[0]}[low];` +
    `[n1]bandpass=f=${num(shape.noiseHigh)}:width_type=h:width=1,${balance[1]}[high];` +
    `[low][high][1:a]amix=inputs=3:weights='0.35 0.25 0.8':normalize=0:duration=longest,` +
    `aformat=sample_rates=48000:channel_layouts=stereo,apad=whole_len=${num(length)},` +
    `atrim=end_sample=${num(length)},asetpts=PTS-STARTPTS[out]`;
}

/** Complete ffmpeg argv after the executable. Produces an exact-length 48 kHz stereo PCM WAV. */
export function sfxArgs(name: SfxName, out: string): string[] {
  if (!(name in SFX_PRESETS)) throw new Vid2Error("E_INPUT", `unknown SFX preset: ${name}`);
  const preset = SFX_PRESETS[name];
  const d = num(preset.durationS);
  const noise = `anoisesrc=color=white:amplitude=0.65:sample_rate=48000:duration=${d}:seed=${num(preset.seed)}`;
  const tone = `aevalsrc=exprs=${quoteExpr(toneExpression(name))}:s=48000:d=${d}`;
  return ["-hide_banner", "-nostdin", "-y", "-f", "lavfi", "-i", noise, "-f", "lavfi", "-i", tone,
    "-filter_complex", graph(name), "-map", "[out]", "-ar", "48000", "-c:a", "pcm_s16le", out];
}
