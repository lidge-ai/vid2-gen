/** Audio provider port (040). Providers run only from 'vid2 audio generate'; render reads cached files through the manifest. */
export type ProviderKind = "music" | "sfx" | "tts";
export interface ProviderCapabilities { music?: boolean; sfx?: boolean; tts?: boolean; reason?: string }
export interface MusicRequest { prompt?: string; plan?: unknown; durationMs: number; bpm?: number; seed?: number }
export interface SfxRequest { text: string; durationS: number; loop?: boolean }
export interface TtsRequest { text: string; voiceId?: string; language?: string; model?: string }
export interface AudioAsset {
  path: string; durationS: number; sampleRate: number;
  provenance: { provider: string; requestId?: string; model?: string; params: Record<string, unknown>; createdAt: string };
}
export interface TtsAsset extends AudioAsset { alignment?: { chars: string[]; start: number[]; end: number[] } }
export interface AudioProvider {
  id: string;
  capabilities(): Promise<ProviderCapabilities>;
  music?(req: MusicRequest): Promise<AudioAsset>;
  sfx?(req: SfxRequest): Promise<AudioAsset>;
  tts?(req: TtsRequest): Promise<TtsAsset>;
}
/** Injectable HTTP for tests (defaults to global fetch). */
export type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean; status: number; headers: { get(name: string): string | null }; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }>;
