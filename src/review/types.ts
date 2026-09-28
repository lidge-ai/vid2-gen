/** Review contracts (devlog 260928_film_grammar/020: G-7..G-9, R-1..R-9, A-1..A-7). Edited by main only. */
import type { AnalyzeReport } from "../analyze/types.ts";

export const REVIEW_SCORES = ["narrative", "hierarchy", "legibility", "continuity", "motion", "audioTiming", "technical"] as const;
export type ReviewScoreName = (typeof REVIEW_SCORES)[number];
export type ReviewScore = 0 | 1 | 2 | 3 | 4 | "cannotDetermine";

export const FINDING_CATEGORIES = [...REVIEW_SCORES, "mix", "lowEnd", "timbre", "groove", "arrangement"] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
export type FindingSource = "frames" | "dsp" | "listener";

export interface ReviewFinding {
  sceneId: string | null; timeS: number; severity: "info" | "warn" | "critical"; category: FindingCategory;
  source: FindingSource; observation: string; evidence: string; fix: string;
}

/** music2-shaped reply: lowEnd optional (default []), genre_fit ignored, any other missing field means UNHEARD. */
export interface ListenReply {
  heard_audio: boolean; overall: string; timbre: string[]; groove: string[]; mix: string[];
  arrangement: string[]; lowEnd: string[]; top_fixes: string[];
}
export type ListenReason = "audio_model_not_configured" | "not_requested" | "excerpt_too_large" | "not_heard"
  | "unsupported_modality" | "provider_error" | "timeout" | "malformed_reply" | "no_audio";
export interface ListenResult {
  status: "HEARD" | "UNHEARD" | "SKIPPED"; reason?: ListenReason; model?: string;
  excerpt?: { startS: number; seconds: number; format: "mp3" | "wav" }; reply?: ListenReply;
}

export interface ReviewReport {
  version: 1; status: "REVIEWED" | "SKIPPED"; reason?: "model_not_configured";
  model: string | null; evidence: string; scores: Record<ReviewScoreName, ReviewScore> | null;
  findings: ReviewFinding[]; listen: ListenResult; limitations: string[];
  usage: { promptTokens?: number; completionTokens?: number; images: number; imageBytes: number } | null;
}
export interface ReviewImage { path: string; role: "sheet" | "keyframe" | "motion" | "spectrogram"; bytes: number }
export interface ReviewEvidence { version: 1; video: string; analyze: AnalyzeReport; qa: unknown; images: ReviewImage[] }
export interface ReviewOptions {
  video: string; timeline?: string; bpm?: number; out?: string; baseUrl?: string; model?: string;
  listen?: boolean; listenExcerptS?: number;
}
