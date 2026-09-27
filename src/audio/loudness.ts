import { runChecked, Vid2Error } from "../shared/index.ts";

export interface Loudness { integrated: number; truePeak: number; lra: number }
export interface LoudnormStats { input_i: number; input_tp: number; input_lra: number; input_thresh: number;
  target_offset: number; normalization_type?: string }
export interface LoudnormResult { normalizationType: string; firstPass: LoudnormStats; loudness: Loudness }

/** Extract the last loudnorm JSON object from ffmpeg stderr. */
export function parseLoudnormJson(stderr: string): LoudnormStats {
  const blocks = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/g) ?? [];
  const raw = blocks.at(-1);
  if (!raw) throw new Vid2Error("E_RENDER", "loudnorm did not report measurements");
  let data: Record<string, unknown>;
  try { data = JSON.parse(raw) as Record<string, unknown>; }
  catch (cause) { throw new Vid2Error("E_RENDER", "Invalid loudnorm JSON", { cause }); }
  const number = (key: string): number => Number(data[key]);
  const fields = ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"] as const;
  if (fields.some((key) => !Number.isFinite(number(key)))) throw new Vid2Error("E_RENDER", "Invalid loudnorm measurements");
  return { input_i: number("input_i"), input_tp: number("input_tp"), input_lra: number("input_lra"),
    input_thresh: number("input_thresh"), target_offset: number("target_offset"),
    ...(typeof data["normalization_type"] === "string" ? { normalization_type: data["normalization_type"] } : {}) };
}

/** Two-pass measured loudnorm, with linear mode requested on pass 2 and 48 kHz PCM output. */
export async function twoPassLoudnorm(input: string, output: string, target: { I: number; TP: number; LRA: number },
  ffmpeg: string): Promise<LoudnormResult> {
  const base = `loudnorm=I=${target.I}:TP=${target.TP}:LRA=${target.LRA}`;
  const first = await runChecked(ffmpeg, ["-hide_banner", "-i", input, "-af", `${base}:print_format=json`, "-f", "null", "-"]);
  const measured = parseLoudnormJson(first.stderr);
  const filter = `${base}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:` +
    `measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:` +
    "linear=true:print_format=json";
  const second = await runChecked(ffmpeg, ["-hide_banner", "-y", "-i", input, "-af", filter,
    "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", output]);
  const report = parseLoudnormJson(second.stderr);
  return { normalizationType: report.normalization_type ?? "unknown", firstPass: measured,
    loudness: await measureLoudness(output, ffmpeg) };
}

/** Read EBU R128 integrated loudness, true peak and range from decoded audio. */
export async function measureLoudness(path: string, ffmpeg: string): Promise<Loudness> {
  const result = await runChecked(ffmpeg, ["-hide_banner", "-i", path, "-filter_complex", "ebur128=peak=true",
    "-f", "null", "-"]);
  const summary = result.stderr.slice(result.stderr.lastIndexOf("Summary:"));
  const integrated = /Integrated loudness:[\s\S]*?I:\s*([-+\d.]+)\s*LUFS/.exec(summary);
  const lra = /Loudness range:[\s\S]*?LRA:\s*([-+\d.]+)\s*LU/.exec(summary);
  const peak = /True peak:[\s\S]*?Peak:\s*([-+\d.]+)\s*dBFS/.exec(summary);
  if (!integrated || !lra || !peak) throw new Vid2Error("E_RENDER", "ebur128 did not report loudness");
  return { integrated: Number(integrated[1]), lra: Number(lra[1]), truePeak: Number(peak[1]) };
}
