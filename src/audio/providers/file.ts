/** File and downloaded audio normalization: all provider assets become 48 kHz WAV. */
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { cacheDir, hashFile, runChecked, Vid2Error } from "../../shared/index.ts";
import { locateTools, probeMedia } from "../../probe/index.ts";
import type { AudioAsset } from "./port.ts";

export interface NormalizedAudio { path: string; durationS: number; sampleRate: 48000 }

/** Decode any FFmpeg-readable audio and resample it to a content-keyed PCM WAV. */
export async function normalizeAudioFile(input: string): Promise<NormalizedAudio> {
  const source = resolve(input);
  const hash = await hashFile(source);
  const output = join(cacheDir("audio"), `${hash}.wav`);
  const tools = locateTools();
  if (!existsSync(output)) {
    try {
      await runChecked(tools.ffmpeg, ["-hide_banner", "-loglevel", "error", "-i", source, "-vn", "-ar", "48000",
        "-ac", "2", "-c:a", "pcm_s16le", "-y", output], { timeoutMs: 120_000 });
    } catch (cause) { throw new Vid2Error("E_PROVIDER", `cannot decode audio file: ${source}`, { cause }); }
  }
  const media = await probeMedia(output);
  if (media.kind !== "audio" || !media.duration || media.sampleRate !== 48000) {
    throw new Vid2Error("E_PROVIDER", `normalized audio is invalid: ${source}`);
  }
  return { path: output, durationS: media.duration, sampleRate: 48000 };
}

/** Store a provider's response temporarily, normalize, then remove the original bytes. */
export async function normalizeAudioBytes(bytes: Buffer, extension: string): Promise<NormalizedAudio> {
  const temp = await mkdtemp(join(tmpdir(), "vid2-audio-provider-"));
  try {
    const input = join(temp, `response${extname(extension) || extension || ".bin"}`);
    await writeFile(input, bytes);
    return await normalizeAudioFile(input);
  } finally { await rm(temp, { recursive: true, force: true }); }
}

/** Local file provider entrypoint. The source stays untouched; the returned path is a 48 kHz cached WAV. */
export async function importAudioFile(path: string): Promise<AudioAsset> {
  let source: string;
  try { source = resolve(path); await readFile(source); }
  catch (cause) { throw new Vid2Error("E_NOT_FOUND", `audio file not found: ${path}`, { cause }); }
  const normalized = await normalizeAudioFile(source);
  return { ...normalized, provenance: { provider: "file", params: { source }, createdAt: new Date().toISOString() } };
}
