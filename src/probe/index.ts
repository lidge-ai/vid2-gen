import { existsSync } from "node:fs";
import { join } from "node:path";
import { packageRoot } from "../shared/index.ts";
import type { ExitCode, Runner } from "../shared/index.ts";
import { KNOWN_BUGS } from "./bugs.ts";
import type { CanaryResult } from "./bugs.ts";
import { installHint, locateTools, probeFfmpeg, probeRunner } from "./ffmpeg.ts";
import type { FfmpegInfo, ToolPaths } from "./ffmpeg.ts";
import { locateOptionalTools } from "./tools.ts";

export { KNOWN_BUGS } from "./bugs.ts";
export type { CanaryResult, KnownBug } from "./bugs.ts";
export { installHint, locateTools, parseCapabilities, parseVersion, probeFfmpeg } from "./ffmpeg.ts";
export type { FfmpegInfo, ProbeOptions, ToolPaths } from "./ffmpeg.ts";
export { probeMedia } from "./media.ts";
export type { MediaInfo } from "./media.ts";
export { requireFeatures } from "./requirements.ts";
export type { FeatureRequirements } from "./requirements.ts";
export { findExecutable, locateOptionalTools } from "./tools.ts";
export type { OptionalTools } from "./tools.ts";

export const EFFECT_FILTERS = ["xfade", "perspective", "zoompan", "overlay", "alphamerge", "ass", "subtitles", "drawtext",
  "lut3d", "curves", "eq", "tmix", "minterpolate", "chromakey", "despill", "gblur", "vignette", "noise", "rgbashift",
  "colorkey", "loudnorm", "ebur128", "aevalsrc", "amix", "acompressor", "alimiter", "sidechaincompress",
  "showspectrumpic", "showwavespic", "blackdetect", "tile"] as const;
const CAPTURE_DEVICES = ["avfoundation", "gdigrab", "ddagrab", "x11grab", "kmsgrab"] as const;
const HW_ENCODERS = ["h264_videotoolbox", "h264_nvenc", "h264_qsv", "h264_amf", "h264_vaapi"] as const;

export interface DoctorReport {
  exit: ExitCode;
  severity: "ok" | "warning" | "error";
  node: string;
  platform: string;
  arch: string;
  tools: { ffmpeg: string | null; ffprobe: string | null; vhs: string | null; agg: string | null; asciinema: string | null };
  ffmpeg: { version: string; major: number; minor: number; libs: FfmpegInfo["libs"];
    counts: { filters: number; encoders: number; decoders: number }; filters: Record<string, boolean>;
    captureDevices: Record<string, boolean>; hwEncoders: Record<string, boolean>; hwaccels: string[] } | null;
  optionalDeps: { playwrightCore: boolean; uiohookNapi: boolean };
  fontsBundled: boolean;
  bugs: { id: string; summary: string; result: CanaryResult; workaround: string }[];
  warnings: string[];
  error: { code: "E_FFMPEG_MISSING" | "E_CAPABILITY"; message: string; fix: string } | null;
}

function available(name: string): boolean {
  try { import.meta.resolve(name); return true; } catch { return false; }
}
function mapped(names: readonly string[], found: Set<string>): Record<string, boolean> {
  return Object.fromEntries(names.map((name) => [name, found.has(name)]));
}
function baseReport(): DoctorReport {
  const optional = locateOptionalTools();
  const fontRoot = join(packageRoot(), "assets", "fonts");
  return { exit: 0, severity: "ok", node: process.version, platform: process.platform, arch: process.arch,
    tools: { ffmpeg: null, ffprobe: null, ...optional }, ffmpeg: null,
    optionalDeps: { playwrightCore: available("playwright-core"), uiohookNapi: available("uiohook-napi") },
    fontsBundled: ["Geist", "GeistMono", "InstrumentSerif"].every((name) => existsSync(join(fontRoot, name))),
    bugs: [], warnings: [], error: null };
}

/** Plain JSON report and command exit status. The CLI should render report.error when exit is 3. */
async function buildDoctorReport(opts: { deep: boolean; runner?: Runner; refresh?: boolean }): Promise<DoctorReport> {
  const report = baseReport();
  let tools: ToolPaths;
  try { tools = locateTools(); }
  catch { return { ...report, exit: 3, severity: "error", error: { code: "E_FFMPEG_MISSING",
    message: "ffmpeg and ffprobe must both be available", fix: installHint() } }; }
  report.tools.ffmpeg = tools.ffmpeg;
  report.tools.ffprobe = tools.ffprobe;
  let info: FfmpegInfo;
  try { info = await probeFfmpeg({ tools, ...(opts.runner ? { runner: opts.runner } : {}), ...(opts.refresh ? { refresh: true } : {}) }); }
  catch { return { ...report, exit: 3, severity: "error", error: { code: "E_CAPABILITY", message: "Could not probe ffmpeg", fix: installHint() } }; }
  report.ffmpeg = { version: info.version, major: info.major, minor: info.minor, libs: info.libs,
    counts: { filters: info.filters.size, encoders: info.encoders.size, decoders: info.decoders.size },
    filters: mapped(EFFECT_FILTERS, info.filters), captureDevices: mapped(CAPTURE_DEVICES, new Set(info.devices.demuxers)),
    hwEncoders: mapped(HW_ENCODERS, info.encoders), hwaccels: info.hwaccels };
  if (info.major < 6 || info.major === 6 && info.minor < 1) {
    report.exit = 3; report.severity = "error";
    report.error = { code: "E_CAPABILITY", message: `FFmpeg ${info.version} is too old; version 6.1 or newer is required`, fix: installHint() };
  } else if (info.major < 7 || info.major === 7 && info.minor < 1) {
    report.warnings.push(`FFmpeg ${info.version} works, but 7.1 or newer is recommended`);
  }
  for (const [filter, present] of Object.entries(report.ffmpeg.filters)) if (!present) report.warnings.push(`Missing optional filter: ${filter}`);
  if (opts.deep) {
    for (const bug of KNOWN_BUGS) report.bugs.push({ id: bug.id, summary: bug.summary,
      result: bug.affects(info) ? await bug.canary(info, tools, probeRunner(opts.runner)) : "skipped", workaround: bug.workaround });
  }
  if (report.exit === 0 && report.warnings.length) report.severity = "warning";
  return report;
}

/** CLI adapter: ok/report/fix coexist with the flat serializable status. */
export async function doctorReport(opts: { deep: boolean; runner?: Runner; refresh?: boolean }): Promise<DoctorReport & { ok: boolean; report: Record<string, unknown>; fix: string | undefined }> {
  const status = await buildDoctorReport(opts);
  return { ...status, ok: status.exit === 0, report: { node: status.node, platform: status.platform, arch: status.arch,
    tools: status.tools, ffmpeg: status.ffmpeg, optionalDeps: status.optionalDeps, fontsBundled: status.fontsBundled,
    bugs: status.bugs, severity: status.severity }, fix: status.error?.fix };
}
