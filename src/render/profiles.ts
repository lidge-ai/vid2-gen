import type { ProfileName, ResolvedOutput } from "../compile/ir.ts";

export interface AppliedProfile extends ResolvedOutput { scale: number; oversample: 1 | 2 }

function evenHalf(value: number): number {
  return Math.max(2, Math.round(value / 4) * 2);
}

/** Apply the proxy canvas size once, before compiling segment graphs. */
export function applyProfile(output: ResolvedOutput, profile: ProfileName): AppliedProfile {
  if (profile === "final") return { ...output, scale: 1, oversample: 2 };
  return { ...output, width: evenHalf(output.width), height: evenHalf(output.height),
    quality: "proxy", scale: 0.5, oversample: 1 };
}

export function videoArgs(output: ResolvedOutput, profile: ProfileName, intermediate = false): string[] {
  if (!intermediate && (output.videoCodec === "vp9" || output.container === "webm")) {
    return ["-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0"];
  }
  if (profile === "proxy" || intermediate) return ["-c:v", "libx264", "-preset", profile === "proxy" ? "ultrafast" : "veryfast",
    "-crf", profile === "proxy" ? "26" : "12", "-pix_fmt", "yuv420p"];
  if (output.videoCodec === "prores") return ["-c:v", "prores_ks", "-profile:v", "3"];
  return ["-c:v", output.videoCodec === "hevc" ? "libx265" : "libx264", "-preset", "slow", "-crf", "18",
    "-pix_fmt", "yuv420p", ...(output.videoCodec === "hevc" ? ["-tag:v", "hvc1"] : [])];
}
