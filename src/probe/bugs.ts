import { run } from "../shared/index.ts";
import type { Runner } from "../shared/index.ts";
import type { FfmpegInfo, ToolPaths } from "./ffmpeg.ts";

export type CanaryResult = "present" | "absent" | "skipped";
export interface KnownBug {
  id: string;
  summary: string;
  affects(info: FfmpegInfo): boolean;
  canary(info: FfmpegInfo, tools: ToolPaths, runner?: Runner): Promise<CanaryResult>;
  workaround: string;
}

async function drawtextCanary(info: FfmpegInfo, tools: ToolPaths, runner: Runner = run): Promise<CanaryResult> {
  if (!info.filters.has("drawtext")) return "skipped";
  try {
    const result = await runner(tools.ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=1",
      "-vf", "drawtext=text=canary:fontsize='20+2*n':fontcolor=white", "-frames:v", "1", "-f", "null", "-"], { timeoutMs: 10_000 });
    if (result.signal === "SIGSEGV" || (result.code ?? 0) > 128) return "present";
    return result.code === 0 ? "absent" : "skipped";
  } catch { return "skipped"; }
}

export const KNOWN_BUGS: KnownBug[] = [
  { id: "drawtext-animated-fontsize-segv", summary: "Animated drawtext fontsize can crash FFmpeg 8.0",
    affects: (info) => info.major === 8 && info.minor === 0, canary: drawtextCanary,
    workaround: "Use ASS subtitles or a fixed drawtext fontsize." },
  { id: "xfade-short-first-input", summary: "xfade with a short first input can fail or drop frames",
    affects: () => true, canary: () => Promise.resolve("skipped"),
    workaround: "Pad each input and trim at the join boundary." },
];
