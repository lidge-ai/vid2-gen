import type { FfmpegInfo } from "../probe/ffmpeg.ts";
import { run } from "../shared/exec.ts";
import type { Runner } from "../shared/exec.ts";
import { Vid2Error } from "../shared/errors.ts";

/** Remotion-style modes: software only, hardware when a probed encoder works, or fail without one. */
export const HW_ACCEL_MODES = ["disable", "if-possible", "required"] as const;
export type HwAccel = (typeof HW_ACCEL_MODES)[number];
export const HW_FAMILIES = ["videotoolbox", "nvenc", "qsv", "amf", "vaapi"] as const;
export type HwFamily = (typeof HW_FAMILIES)[number];
export interface HardwareRequest { mode: HwAccel; family?: HwFamily }

/** Final-encode codec arguments. preInput goes before the inputs; filter is appended to the output video chain. */
export interface EncoderChoice { name: string; hardware: boolean; args: string[]; preInput: string[]; filter: string | null }
export interface EncoderSelection { choice: EncoderChoice | null; warnings: string[]; tried: { name: string; error: string }[] }

type Codec = "h264" | "hevc" | "prores";

function vaapiDevice(): string {
  return process.env["VID2_VAAPI_DEVICE"] ?? "/dev/dri/renderD128";
}

/**
 * Candidate argument sets per family, best first. VideoToolbox -q:v needs Apple Silicon, so Intel Macs fall back to a bitrate.
 * H.264 q:v 70 / HEVC q:v 74 matched libx264 -preset slow -crf 18 within 0.3 VMAF on a grain-heavy 1080p film (devlog 260929).
 */
function variants(family: HwFamily, codec: Codec, bitrate: string): Omit<EncoderChoice, "hardware">[] {
  const tag = codec === "hevc" ? ["-tag:v", "hvc1"] : [];
  const plain = (name: string, args: string[]): Omit<EncoderChoice, "hardware"> =>
    ({ name, args: ["-c:v", name, ...args, ...tag], preInput: [], filter: null });
  if (codec === "prores") return family === "videotoolbox" ? [plain("prores_videotoolbox", ["-profile:v", "hq", "-pix_fmt", "p210le"])] : [];
  const name = codec + "_" + family;
  switch (family) {
    case "videotoolbox": return [plain(name, ["-q:v", codec === "hevc" ? "74" : "70", "-pix_fmt", "yuv420p"]),
      plain(name, ["-b:v", bitrate, "-pix_fmt", "yuv420p"])];
    case "nvenc": return [plain(name, ["-preset", "p5", "-tune", "hq", "-rc", "vbr", "-cq", codec === "hevc" ? "21" : "19", "-b:v", "0",
      "-spatial-aq", "1", "-pix_fmt", "yuv420p"])];
    case "qsv": return [plain(name, ["-global_quality", codec === "hevc" ? "22" : "20", "-pix_fmt", "nv12"])];
    case "amf": return [plain(name, ["-rc", "cqp", "-qp_i", "18", "-qp_p", "20", "-quality", "quality", "-pix_fmt", "yuv420p"])];
    case "vaapi": return [{ name, args: ["-c:v", name, "-rc_mode", "CQP", "-qp", "20", ...tag],
      preInput: ["-vaapi_device", vaapiDevice()], filter: "format=nv12,hwupload" }];
  }
}

/** About 0.15 bits per pixel per frame: 9 Mb/s for 1080p30, used only where constant quality is unavailable. */
export function fallbackBitrate(width: number, height: number, fps: number): string {
  return String(Math.round((width * height * fps * 0.15) / 1e5) / 10) + "M";
}

const probes = new Map<string, Promise<string | null>>();

/** A listed encoder may still lack a device or driver; a five-frame encode proves it. Resolves to null or the error text. */
export function probeEncoder(ffmpeg: string, choice: Omit<EncoderChoice, "hardware">, runner: Runner = run): Promise<string | null> {
  const key = JSON.stringify([ffmpeg, choice.preInput, choice.filter, choice.args]);
  let probe = probes.get(key);
  if (!probe) {
    probe = runner(ffmpeg, ["-hide_banner", "-v", "error", ...choice.preInput, "-f", "lavfi", "-i", "color=c=gray:s=256x144:r=30:d=0.2",
      ...(choice.filter ? ["-vf", choice.filter] : []), ...choice.args, "-frames:v", "5", "-f", "null", "-"], { timeoutMs: 20_000 })
      .then((r) => r.code === 0 ? null : (r.stderr.trim().split(/\r?\n/).pop() ?? "exit " + String(r.code)))
      .catch((error: unknown) => String(error));
    probes.set(key, probe);
  }
  return probe;
}

export function clearEncoderProbes(): void { probes.clear(); }

export interface HardwareProbe { name: string; ok: boolean; error?: string }

/** Doctor: probe every compiled-in hardware encoder with its first argument set. */
export async function probeHardware(info: FfmpegInfo, ffmpeg: string, runner: Runner = run): Promise<HardwareProbe[]> {
  const found = (["h264", "hevc", "prores"] as const).flatMap((codec) => HW_FAMILIES.map((family) => variants(family, codec, "8M")[0]))
    .filter((c): c is Omit<EncoderChoice, "hardware"> => !!c && info.encoders.has(c.name));
  return Promise.all(found.map(async (c) => {
    const error = await probeEncoder(ffmpeg, c, runner);
    return error === null ? { name: c.name, ok: true } : { name: c.name, ok: false, error };
  }));
}

export interface SelectInput { info: FfmpegInfo; ffmpeg: string; codec: string; container: string; width: number; height: number; fps: number }

/** Pick the final-encode encoder: null means software. Throws E_CAPABILITY when mode is required and nothing works. */
export async function selectEncoder(input: SelectInput, request: HardwareRequest, runner: Runner = run): Promise<EncoderSelection> {
  if (request.mode === "disable") return { choice: null, warnings: [], tried: [] };
  const codec = input.container === "webm" ? null : (["h264", "hevc", "prores"] as const).find((c) => c === input.codec) ?? null;
  const families = request.family ? [request.family] : [...HW_FAMILIES];
  const candidates = codec ? families.flatMap((family) =>
    variants(family, codec, fallbackBitrate(input.width, input.height, input.fps))).filter((c) => input.info.encoders.has(c.name)) : [];
  const tried: EncoderSelection["tried"] = [];
  for (const candidate of candidates) {
    const error = await probeEncoder(input.ffmpeg, candidate, runner);
    if (error === null) return { choice: { ...candidate, hardware: true }, warnings: [], tried };
    tried.push({ name: candidate.name, error });
  }
  const what = codec ? (request.family ? request.family + " " : "") + codec : input.container === "webm" ? "WebM" : input.codec;
  const reason = !codec ? "Hardware encode supports H.264, HEVC and ProRes only" : tried.length
    ? "No " + what + " hardware encoder passed its probe (" + tried.map((t) => t.name).join(", ") + ")" : "No " + what + " hardware encoder in this ffmpeg";
  if (request.mode === "required") {
    throw new Vid2Error("E_CAPABILITY", reason, { details: { tried }, fix: "Use --hw-accel if-possible or disable, or install drivers for the encoder" });
  }
  return { choice: null, warnings: [reason + "; using software"], tried };
}

/** CLI values: --hw is if-possible; --hw-accel wins when both are given; --hw-encoder alone implies if-possible. */
export function hardwareRequest(values: { hw?: unknown; accel?: unknown; family?: unknown }): HardwareRequest {
  const mode = values.accel === undefined ? (values.hw === true || values.family !== undefined ? "if-possible" : "disable") : values.accel;
  if (!HW_ACCEL_MODES.includes(mode as HwAccel)) throw new Vid2Error("E_INPUT", "--hw-accel must be disable, if-possible or required");
  if (values.family !== undefined && !HW_FAMILIES.includes(values.family as HwFamily)) {
    throw new Vid2Error("E_INPUT", "--hw-encoder must be one of " + HW_FAMILIES.join(", "));
  }
  return { mode: mode as HwAccel, ...(values.family !== undefined ? { family: values.family as HwFamily } : {}) };
}
