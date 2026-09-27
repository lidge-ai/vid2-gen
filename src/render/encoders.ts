import type { FfmpegInfo } from "../probe/ffmpeg.ts";

export interface EncoderChoice { args: string[]; name: string | null; warning?: string }

const HARDWARE: [string, string[]][] = [
  ["h264_videotoolbox", ["-c:v", "h264_videotoolbox", "-q:v", "65"]],
  ["h264_nvenc", ["-c:v", "h264_nvenc", "-cq", "19", "-preset", "p5"]],
  ["h264_qsv", ["-c:v", "h264_qsv", "-global_quality", "20"]],
  ["h264_amf", ["-c:v", "h264_amf", "-qp_i", "18", "-qp_p", "20"]],
  ["h264_vaapi", ["-c:v", "h264_vaapi", "-qp", "20"]],
];

/** Capability discovery is approximate; a listed encoder may still lack a usable device. */
export function selectHardwareEncoder(info: FfmpegInfo, requested: boolean): EncoderChoice {
  if (!requested) return { args: [], name: null };
  const found = HARDWARE.find(([name]) => info.encoders.has(name));
  if (!found) return { args: [], name: null, warning: "No supported hardware encoder found; using software" };
  return { args: found[1], name: found[0] };
}
