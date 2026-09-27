import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cacheDir, run, sha256, Vid2Error } from "../shared/index.ts";
import type { Runner } from "../shared/index.ts";
import { findExecutable } from "./tools.ts";

export interface FfmpegInfo {
  path: string;
  version: string;
  major: number;
  minor: number;
  buildFlags: string[];
  filters: Set<string>;
  encoders: Set<string>;
  decoders: Set<string>;
  devices: { demuxers: string[] };
  hwaccels: string[];
  libs: { ass: boolean; freetype: boolean; harfbuzz: boolean; vmaf: boolean; placebo: boolean };
}
export interface ToolPaths { ffmpeg: string; ffprobe: string }
export interface ProbeOptions { refresh?: boolean; runner?: Runner; tools?: ToolPaths }

export function installHint(): string {
  if (process.platform === "darwin") return "Install or upgrade FFmpeg with: brew install ffmpeg";
  if (process.platform === "win32") return "Install or upgrade FFmpeg with: winget install Gyan.FFmpeg (or choco install ffmpeg)";
  return "Install or upgrade FFmpeg with your package manager, for example: sudo apt install ffmpeg";
}

function fakeEnabled(): boolean {
  return process.env["NODE_ENV"] === "test" && process.env["VID2_TEST_FFMPEG_RUNNER"] === "node-fake";
}

export function locateTools(): ToolPaths {
  const fake = fakeEnabled();
  const ffmpeg = process.env["VID2_FFMPEG"] ? findExecutable(process.env["VID2_FFMPEG"]) : fake ? "node-fake:ffmpeg" : findExecutable("ffmpeg");
  const ffprobe = process.env["VID2_FFPROBE"] ? findExecutable(process.env["VID2_FFPROBE"]) : fake ? "node-fake:ffprobe" : findExecutable("ffprobe");
  if (!ffmpeg || !ffprobe) throw new Vid2Error("E_FFMPEG_MISSING", "ffmpeg and ffprobe must both be available", {
    details: { ffmpeg, ffprobe }, fix: installHint(),
  });
  return { ffmpeg, ffprobe };
}

/** Parses a single ffmpeg capability list, ignoring its legend and prose. */
export function parseCapabilities(text: string, kind: "filters" | "codecs" | "devices"): Set<string> {
  const out = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const pattern = kind === "filters" ? /^\s*[T.][S.][C.]?\s+([\w-]+)\s+\S+->\S+/ :
      kind === "devices" ? /^\s*D[ .]\s+([\w-]+)\s/ : /^\s*[VAS][.A-Z]{5}\s+([\w-]+)\s/;
    const match = pattern.exec(line);
    if (match?.[1]) out.add(match[1]);
  }
  return out;
}

export function parseVersion(text: string): { version: string; major: number; minor: number } {
  const match = /ffmpeg version\s+(?:n)?(\d+)\.(\d+)(?:\.\d+)?/i.exec(text);
  if (!match) throw new Vid2Error("E_CAPABILITY", "Could not parse ffmpeg version", { fix: installHint() });
  return { version: match[0].replace(/^ffmpeg version\s+/i, ""), major: Number(match[1]), minor: Number(match[2]) };
}

function parseInfo(path: string, output: Record<string, string>): FfmpegInfo {
  const version = parseVersion(output["-version"] ?? "");
  const buildFlags = [output["-version"] ?? "", output["-buildconf"] ?? ""].join("\n").match(/--(?:enable|disable)-[\w-]+/g) ?? [];
  const flags = [...new Set(buildFlags)];
  const has = (lib: string) => flags.includes(`--enable-${lib}`) && !flags.includes(`--disable-${lib}`);
  return {
    path, ...version, buildFlags: flags,
    filters: parseCapabilities(output["-filters"] ?? "", "filters"),
    encoders: parseCapabilities(output["-encoders"] ?? "", "codecs"),
    decoders: parseCapabilities(output["-decoders"] ?? "", "codecs"),
    devices: { demuxers: [...parseCapabilities(output["-devices"] ?? "", "devices")] },
    hwaccels: (output["-hwaccels"] ?? "").split(/\r?\n/).map((s) => s.trim()).filter((s) => !!s && s !== "Hardware acceleration methods:"),
    libs: { ass: has("libass"), freetype: has("libfreetype"), harfbuzz: has("libharfbuzz"), vmaf: has("libvmaf"), placebo: has("libplacebo") },
  };
}

function fromCache(raw: string): FfmpegInfo {
  const value = JSON.parse(raw) as Omit<FfmpegInfo, "filters" | "encoders" | "decoders"> & { filters: string[]; encoders: string[]; decoders: string[] };
  return { ...value, filters: new Set(value.filters), encoders: new Set(value.encoders), decoders: new Set(value.decoders) };
}

export function probeRunner(runner?: Runner): Runner {
  if (runner) return runner;
  if (!fakeEnabled()) return run;
  return (_cmd, args, options) => run(process.execPath, [fileURLToPath(new URL("../../tests/fixtures/bin/fake-ffmpeg.mjs", import.meta.url)), ...args], options);
}

export async function probeFfmpeg(opts: ProbeOptions = {}): Promise<FfmpegInfo> {
  const tools = opts.tools ?? (opts.runner ? { ffmpeg: "ffmpeg", ffprobe: "ffprobe" } : locateTools());
  const fake = fakeEnabled();
  const runner = probeRunner(opts.runner);
  let cachePath: string | undefined;
  if (!fake && !opts.runner) {
    const meta = await stat(tools.ffmpeg);
    cachePath = join(cacheDir("probe"), `ffmpeg-${sha256(`${tools.ffmpeg}:${meta.mtimeMs}:${meta.size}`)}.json`);
    if (!opts.refresh) {
      try { return fromCache(await readFile(cachePath, "utf8")); } catch { /* probe afresh */ }
    }
  }
  const output: Record<string, string> = {};
  for (const flag of ["-version", "-filters", "-encoders", "-decoders", "-devices", "-hwaccels", "-buildconf"]) {
    let result;
    try { result = await runner(tools.ffmpeg, ["-hide_banner", flag], { timeoutMs: 15_000 }); }
    catch (cause) { throw new Vid2Error("E_FFMPEG_MISSING", `Could not run ffmpeg: ${tools.ffmpeg}`, { cause, fix: installHint() }); }
    if (result.code !== 0) throw new Vid2Error("E_CAPABILITY", `ffmpeg ${flag} failed: ${result.stderr.slice(-400)}`, { fix: installHint() });
    output[flag] = result.stdout.toString("utf8") + "\n" + result.stderr;
  }
  const info = parseInfo(tools.ffmpeg, output);
  if (cachePath) await writeFile(cachePath, JSON.stringify({ ...info, filters: [...info.filters], encoders: [...info.encoders], decoders: [...info.decoders] }));
  return info;
}
