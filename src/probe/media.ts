import { run, Vid2Error } from "../shared/index.ts";
import type { Fps, Runner } from "../shared/index.ts";
import { locateTools } from "./ffmpeg.ts";

export interface MediaInfo {
  path: string;
  kind: "image" | "video" | "audio";
  width?: number;
  height?: number;
  fps?: Fps;
  frames?: number;
  duration?: number;
  pixFmt?: string;
  colorRange?: string;
  hasAudio: boolean;
  sampleRate?: number;
  channels?: number;
}
interface Stream {
  codec_type?: string; codec_name?: string; width?: number; height?: number;
  r_frame_rate?: string; avg_frame_rate?: string; nb_frames?: string;
  duration?: string; pix_fmt?: string; color_range?: string;
  sample_rate?: string; channels?: number;
}
interface ProbeJson { format?: { format_name?: string; duration?: string }; streams?: Stream[] }

function positiveNumber(value: string | number | undefined): number | undefined {
  const number = Number(value);
  return value !== undefined && Number.isFinite(number) && number > 0 ? number : undefined;
}
function parseRate(value: string | undefined): Fps | undefined {
  const match = /^(\d+)\/(\d+)$/.exec(value ?? "");
  if (!match) return undefined;
  const num = Number(match[1]); const den = Number(match[2]);
  return num > 0 && den > 0 ? { num, den } : undefined;
}

export async function probeMedia(path: string, runner: Runner = run): Promise<MediaInfo> {
  const ffprobe = runner === run ? locateTools().ffprobe : "ffprobe";
  let result;
  try { result = await runner(ffprobe, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path], { timeoutMs: 15_000 }); }
  catch (cause) { throw new Vid2Error("E_NOT_FOUND", `Cannot inspect media: ${path}`, { cause }); }
  if (result.code !== 0) throw new Vid2Error("E_INPUT", `ffprobe failed for ${path}`, { details: { stderr: result.stderr.slice(-500) } });
  let data: ProbeJson;
  try { data = JSON.parse(result.stdout.toString("utf8")) as ProbeJson; }
  catch (cause) { throw new Vid2Error("E_INPUT", `Invalid ffprobe output for ${path}`, { cause }); }
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  if (!video && !audio) throw new Vid2Error("E_INPUT", `No audio or video stream in ${path}`);
  const formatNames = (data.format?.format_name ?? "").split(",");
  const image = !!video && (formatNames.includes("image2") || formatNames.includes("png_pipe") || formatNames.includes("jpeg_pipe") ||
    ["png", "mjpeg", "webp", "bmp"].includes(video.codec_name ?? "") && !positiveNumber(data.format?.duration));
  const fps = parseRate(video?.avg_frame_rate) ?? parseRate(video?.r_frame_rate);
  const duration = positiveNumber(data.format?.duration) ?? positiveNumber(video?.duration) ?? positiveNumber(audio?.duration);
  const frames = image ? 1 : positiveNumber(video?.nb_frames) ?? (duration && fps ? Math.round(duration * fps.num / fps.den) : undefined);
  const out: MediaInfo = { path, kind: image ? "image" : video ? "video" : "audio", hasAudio: !!audio };
  if (video?.width !== undefined) out.width = video.width;
  if (video?.height !== undefined) out.height = video.height;
  if (fps) out.fps = fps;
  if (frames !== undefined) out.frames = frames;
  if (duration !== undefined) out.duration = duration;
  if (video?.pix_fmt) out.pixFmt = video.pix_fmt;
  if (video?.color_range) out.colorRange = video.color_range;
  const sampleRate = positiveNumber(audio?.sample_rate);
  if (sampleRate !== undefined) out.sampleRate = sampleRate;
  if (audio?.channels !== undefined) out.channels = audio.channels;
  return out;
}
