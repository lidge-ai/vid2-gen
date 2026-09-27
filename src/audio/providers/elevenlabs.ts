/** ElevenLabs music, sound effects, and timestamped speech. Credentials never enter provenance. */
import { Vid2Error } from "../../shared/index.ts";
import { normalizeAudioBytes } from "./file.ts";
import type { AudioAsset, AudioProvider, Fetch, MusicRequest, SfxRequest, TtsAsset, TtsRequest } from "./port.ts";

export interface ElevenLabsOptions { apiKey?: string; baseUrl?: string; fetch?: Fetch }
type ResponseLike = Awaited<ReturnType<Fetch>>;

function requestId(response: ResponseLike): string | undefined {
  return response.headers.get("request-id") ?? response.headers.get("xi-request-id") ?? undefined;
}

function networkError(error: unknown): Vid2Error {
  if (error instanceof Vid2Error) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || name === "TimeoutError") return new Vid2Error("E_TIMEOUT", "ElevenLabs request timed out", { retryable: true, cause: error });
  return new Vid2Error("E_PROVIDER", "could not connect to ElevenLabs", { retryable: true, cause: error });
}

async function checked(response: ResponseLike): Promise<ResponseLike> {
  if (response.ok) return response;
  if (response.status === 401 || response.status === 403) throw new Vid2Error("E_ACCESS", `ElevenLabs rejected credentials (${response.status})`);
  throw new Vid2Error("E_PROVIDER", `ElevenLabs request failed (${response.status})`, { retryable: response.status >= 500 });
}

function provenance(kind: string, params: Record<string, unknown>, model: string, response: ResponseLike): AudioAsset["provenance"] {
  const id = requestId(response);
  const safeParams = JSON.parse(JSON.stringify({ kind, ...params })) as Record<string, unknown>;
  return { provider: "elevenlabs", model, params: safeParams, createdAt: new Date().toISOString(),
    ...(id === undefined ? {} : { requestId: id }) };
}

function alignment(value: unknown): TtsAsset["alignment"] {
  if (!value || typeof value !== "object") return undefined;
  const data = value as { characters?: unknown; character_start_times_seconds?: unknown; character_end_times_seconds?: unknown };
  if (!Array.isArray(data.characters) || !Array.isArray(data.character_start_times_seconds) || !Array.isArray(data.character_end_times_seconds)) return undefined;
  if (!data.characters.every(item => typeof item === "string") || !data.character_start_times_seconds.every(item => typeof item === "number") ||
    !data.character_end_times_seconds.every(item => typeof item === "number")) return undefined;
  return { chars: data.characters, start: data.character_start_times_seconds, end: data.character_end_times_seconds };
}

export function createElevenLabs(opts: ElevenLabsOptions = {}): AudioProvider {
  const key = opts.apiKey ?? process.env["ELEVENLABS_API_KEY"];
  const base = (opts.baseUrl ?? process.env["ELEVENLABS_BASE_URL"] ?? "https://api.elevenlabs.io").replace(/\/+$/, "");
  const fetcher: Fetch = opts.fetch ?? globalThis.fetch;
  async function post(path: string, body: Record<string, unknown>): Promise<ResponseLike> {
    if (!key) throw new Vid2Error("E_CAPABILITY", "ElevenLabs API key is not configured", { fix: "Set ELEVENLABS_API_KEY." });
    try { return await checked(await fetcher(`${base}${path}`, { method: "POST", headers: { "xi-api-key": key,
      "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) })); }
    catch (error) { throw networkError(error); }
  }
  return { id: "elevenlabs",
    async capabilities() { return key ? { music: true, sfx: true, tts: true } : { music: false, sfx: false, tts: false,
      reason: "Set ELEVENLABS_API_KEY to enable ElevenLabs." }; },
    async music(req: MusicRequest): Promise<AudioAsset> {
      const model = "music_v2_5";
      const body = { model_id: model, music_length_ms: req.durationMs,
        ...(req.plan === undefined ? { prompt: req.prompt } : { composition_plan: req.plan }),
        ...(req.bpm === undefined ? {} : { bpm: req.bpm }), ...(req.seed === undefined ? {} : { seed: req.seed }) };
      const response = await post("/v1/music?output_format=mp3_48000_192", body);
      const normalized = await normalizeAudioBytes(Buffer.from(await response.arrayBuffer()), ".mp3");
      return { ...normalized, provenance: provenance("music", { prompt: req.prompt, durationMs: req.durationMs,
        plan: req.plan, bpm: req.bpm, seed: req.seed }, model, response) };
    },
    async sfx(req: SfxRequest): Promise<AudioAsset> {
      if (req.durationS < 0.1 || req.durationS > 30) throw new Vid2Error("E_INPUT", "ElevenLabs SFX duration must be 0.1–30 seconds");
      const model = "eleven_text_to_sound_v2";
      const response = await post("/v1/sound-generation", { text: req.text, duration_seconds: req.durationS,
        loop: req.loop ?? false, model_id: model });
      const normalized = await normalizeAudioBytes(Buffer.from(await response.arrayBuffer()), ".mp3");
      return { ...normalized, provenance: provenance("sfx", { text: req.text, durationS: req.durationS, loop: req.loop }, model, response) };
    },
    async tts(req: TtsRequest): Promise<TtsAsset> {
      const voice = req.voiceId ?? process.env["ELEVENLABS_VOICE_ID"];
      if (!voice) throw new Vid2Error("E_CAPABILITY", "ElevenLabs TTS voice is not configured", { fix: "Set a voiceId or ELEVENLABS_VOICE_ID." });
      const model = req.model ?? "eleven_multilingual_v2";
      const response = await post(`/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps`, { text: req.text,
        model_id: model, ...(req.language === undefined ? {} : { language_code: req.language }) });
      let data: unknown;
      try { data = JSON.parse(await response.text()); }
      catch (cause) { throw new Vid2Error("E_PROVIDER", "ElevenLabs TTS response is malformed", { cause }); }
      const body = data as { audio_base64?: unknown; alignment?: unknown; normalized_alignment?: unknown };
      if (!body || typeof body.audio_base64 !== "string") throw new Vid2Error("E_PROVIDER", "ElevenLabs TTS response has no audio");
      const normalized = await normalizeAudioBytes(Buffer.from(body.audio_base64, "base64"), ".mp3");
      const times = alignment(body.alignment ?? body.normalized_alignment);
      return { ...normalized, provenance: provenance("tts", { text: req.text, voice, language: req.language }, model, response),
        ...(times === undefined ? {} : { alignment: times }) };
    } };
}
