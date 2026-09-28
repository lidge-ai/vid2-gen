import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../shared/index.ts";
import type { FfmpegInfo } from "../probe/index.ts";
import type { AnalyzeReport } from "../analyze/types.ts";
import type { ListenReason, ListenReply, ListenResult } from "./types.ts";
import { endpoint } from "./client.ts";
import { safeModelText } from "./report.ts";

const PROMPT = "Listen to the attached audio. If you cannot hear it, set heard_audio false. Return strict JSON only: "
  + "heard_audio:boolean, overall:string, timbre:string[], groove:string[], mix:string[], arrangement:string[], "
  + "lowEnd:string[], top_fixes:string[]. Describe timbre, groove, arrangement and mood from what you hear. "
  + "Do not supply measured LUFS, peak, BPM, sync or frequency claims. Low-end and sub-bass impressions are weak.";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}
export function parseListenReply(text: string, secret?: string): ListenReply | null {
  let value: unknown;
  try { value = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/gi, "")) as unknown; } catch { return null; }
  if (!record(value) || typeof value.heard_audio !== "boolean" || typeof value.overall !== "string"
    || !strings(value.timbre) || !strings(value.groove) || !strings(value.mix)
    || !strings(value.arrangement) || !strings(value.top_fixes)
    || value.lowEnd !== undefined && !strings(value.lowEnd)) return null;
  const clean = (items: string[]): string[] => items.map((item) => safeModelText(item, secret));
  return { heard_audio: value.heard_audio, overall: safeModelText(value.overall, secret), timbre: clean(value.timbre),
    groove: clean(value.groove), mix: clean(value.mix), arrangement: clean(value.arrangement),
    lowEnd: clean(value.lowEnd ?? []), top_fixes: clean(value.top_fixes) };
}

function responseText(body: unknown): string | null {
  if (!record(body) || body.status === "failed" || !Array.isArray(body.output)) return null;
  const out: string[] = [];
  for (const item of body.output) {
    if (!record(item) || !Array.isArray(item.content)) continue;
    for (const part of item.content) if (record(part) && part.type === "output_text" && typeof part.text === "string") out.push(part.text);
  }
  return out.join("") || null;
}

function streamText(body: string): string | null {
  const chunks: string[] = [];
  for (const event of body.replace(/\r\n/g, "\n").split(/\n\n+/)) {
    const data = event.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data || data === "[DONE]") continue;
    let value: unknown;
    try { value = JSON.parse(data) as unknown; } catch { return null; }
    if (!record(value) || value.type === "response.failed") return null;
    if (value.type === "response.output_text.delta" && typeof value.delta === "string") chunks.push(value.delta);
  }
  return chunks.join("") || null;
}

async function request(url: string, model: string, key: string | undefined, fileData: string,
  filename: string, signal: AbortSignal): Promise<{ reply?: ListenReply; reason?: ListenReason }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  const send = (stream: boolean): Promise<Response> => fetch(url, { method: "POST", headers, signal,
    body: JSON.stringify({ model, input: [{ role: "user", content: [
      { type: "input_text", text: PROMPT }, { type: "input_file", filename, file_data: fileData },
    ] }], stream }) });
  let response = await send(false);
  let body = await response.text();
  let streamed = false;
  if (response.status === 400 && /stream must be set to true/i.test(body)) {
    response = await send(true); body = await response.text(); streamed = true;
  }
  if (response.status === 400 && /cannot translate audio|unsupported_input_modality/i.test(body)) return { reason: "unsupported_modality" };
  if (!response.ok) return { reason: "provider_error" };
  let text: string | null;
  if (streamed) text = streamText(body);
  else {
    let parsed: unknown;
    try { parsed = JSON.parse(body) as unknown; } catch { parsed = null; }
    text = responseText(parsed);
  }
  if (!text) return { reason: "malformed_reply" };
  const reply = parseListenReply(text, key);
  return reply ? reply.heard_audio ? { reply } : { reason: "not_heard" } : { reason: "malformed_reply" };
}

async function excerpt(video: string, analyze: AnalyzeReport, ffmpeg: FfmpegInfo, requestedS: number): Promise<{
  file: string; dir: string; startS: number; seconds: number; format: "mp3" | "wav" }> {
  const seconds = Math.min(requestedS, analyze.durationS);
  const startS = Math.max(0, Math.min(analyze.durationS - seconds, (analyze.audio?.loudestS ?? 0) - seconds / 2));
  const format = ffmpeg.encoders.has("libmp3lame") ? "mp3" : "wav";
  const dir = await mkdtemp(join(tmpdir(), "vid2-listen-"));
  const file = join(dir, `excerpt.${format}`);
  const args = ["-v", "error", "-ss", String(startS), "-i", video, "-t", String(seconds), "-vn", "-ac", "1", "-ar", "22050",
    ...(format === "mp3" ? ["-c:a", "libmp3lame", "-b:a", "64k"] : ["-c:a", "pcm_s16le"]), "-y", file];
  try {
    const result = await run(ffmpeg.path, args, { timeoutMs: 120_000 });
    if (result.code !== 0) throw new Error("ffmpeg excerpt failed");
    return { file, dir, startS, seconds, format };
  } catch (error) { await rm(dir, { recursive: true, force: true }); throw error; }
}

/** Audio critique is best effort. No failure changes the image review outcome. */
export async function listenToVideo(input: { requested: boolean; video: string; analyze: AnalyzeReport; ffmpeg: FfmpegInfo;
  excerptS?: number; baseUrl?: string; model?: string; apiKey?: string }): Promise<ListenResult> {
  if (!input.requested) return { status: "SKIPPED", reason: "not_requested" };
  if (!input.baseUrl || !input.model) return { status: "SKIPPED", reason: "audio_model_not_configured" };
  if (!input.analyze.audio) return { status: "UNHEARD", reason: "no_audio", model: input.model };
  let dir: string | undefined;
  try {
    const seconds = input.excerptS ?? 30;
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 120) return { status: "UNHEARD", reason: "provider_error", model: input.model };
    const clip = await excerpt(input.video, input.analyze, input.ffmpeg, seconds);
    dir = clip.dir;
    const excerptInfo = { startS: clip.startS, seconds: clip.seconds, format: clip.format };
    if ((await stat(clip.file)).size > 8 * 1024 * 1024) return { status: "UNHEARD", reason: "excerpt_too_large", model: input.model, excerpt: excerptInfo };
    const bytes = await readFile(clip.file);
    const fileData = `data:audio/${clip.format === "mp3" ? "mpeg" : "wav"};base64,${bytes.toString("base64")}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const result = await request(endpoint(input.baseUrl, "responses"), input.model, input.apiKey,
        fileData, `excerpt.${clip.format}`, controller.signal);
      if (!result.reply) return { status: "UNHEARD", reason: result.reason ?? "provider_error", model: input.model, excerpt: excerptInfo };
      return { status: "HEARD", model: input.model, excerpt: excerptInfo, reply: result.reply };
    } catch { return { status: "UNHEARD", reason: controller.signal.aborted ? "timeout" : "provider_error", model: input.model, excerpt: excerptInfo }; }
    finally { clearTimeout(timer); }
  } catch { return { status: "UNHEARD", reason: "provider_error", model: input.model }; }
  finally { if (dir) await rm(dir, { recursive: true, force: true }); }
}
