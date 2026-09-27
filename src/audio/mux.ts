import { runChecked, Vid2Error } from "../shared/index.ts";
import { measureLoudness } from "./loudness.ts";
import type { Loudness } from "./loudness.ts";

export interface MuxOptions { video: string; audio: string; out: string; codec: "aac" | "opus";
  seconds: number; ffmpeg: string; ffprobe: string; targetTP?: number }
export interface MuxResult { loudness: Loudness; durationDelta: number; warnings: string[] }

async function audioDuration(path: string, ffprobe: string): Promise<number> {
  const result = await runChecked(ffprobe, ["-v", "error", "-select_streams", "a:0", "-show_entries",
    "stream=duration", "-of", "json", path]);
  const parsed = JSON.parse(result.stdout.toString("utf8")) as { streams?: { duration?: string }[] };
  const duration = Number(parsed.streams?.[0]?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    const packets = await runChecked(ffprobe, ["-v", "error", "-select_streams", "a:0", "-show_entries",
      "packet=pts_time,duration_time", "-of", "csv=p=0", path]);
    const lines = packets.stdout.toString("utf8").trim().split(/\r?\n/);
    const values = lines.at(-1)?.split(",").map(Number);
    const last = values && values.length >= 2 ? values[0]! + values[1]! : NaN;
    if (!Number.isFinite(last)) throw new Vid2Error("E_RENDER", "Could not measure muxed audio duration");
    return last;
  }
  return duration;
}

/** Copy video, encode 48 kHz audio to the selected delivery codec, then measure the encoded result. */
export async function muxAudio(opts: MuxOptions): Promise<MuxResult> {
  if (!Number.isFinite(opts.seconds) || opts.seconds <= 0) throw new Vid2Error("E_INPUT", "Invalid mux duration");
  await runChecked(opts.ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", opts.video, "-i", opts.audio,
    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", opts.codec === "aac" ? "aac" : "libopus",
    "-b:a", opts.codec === "aac" ? "256k" : "192k", "-ar", "48000", "-t", String(opts.seconds),
    ...(opts.codec === "aac" ? ["-movflags", "+faststart"] : []), opts.out]);
  const loudness = await measureLoudness(opts.out, opts.ffmpeg);
  const durationDelta = await audioDuration(opts.out, opts.ffprobe) - opts.seconds;
  const ceiling = (opts.targetTP ?? -1) + 0.5;
  const warnings = loudness.truePeak > ceiling ? [`Post-codec true peak ${loudness.truePeak} dBFS exceeds ${ceiling} dBFS`] : [];
  return { loudness, durationDelta, warnings };
}
