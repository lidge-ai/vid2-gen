/** Analyze contracts (devlog 260928_film_grammar/020: G-6..G-9, R-1..R-9, A-1..A-7). Shared by the wp3 workers; edited by main only. */
import type { FfmpegInfo } from "../probe/index.ts";

export type AnalyzeMethod = "timeline" | "scene-detect-0.30";

/** A shot span handed to the audio pass; frames are [startFrame, endFrame). */
export interface ShotSpan { id: string; startFrame: number; endFrame: number; startS: number; endS: number }

export interface AnalyzeShot extends ShotSpan {
  sceneId: string | null; seconds: number; beats: number | null;
  nearestBeatDeltaMs: number | null; nearestOnsetDeltaMs: number | null;
  motion: number; meanLuma: number; meanSaturation: number; palette: string[]; keyframe: string;
}
export interface AnalyzeCut { frame: number; s: number; beatDeltaMs: number | null; onsetDeltaMs: number | null }

export const AUDIO_BANDS = [
  { name: "sub", fromHz: 20, toHz: 60 }, { name: "low", fromHz: 60, toHz: 250 },
  { name: "lowMid", fromHz: 250, toHz: 500 }, { name: "mid", fromHz: 500, toHz: 2000 },
  { name: "presence", fromHz: 2000, toHz: 6000 }, { name: "air", fromHz: 6000, toHz: 11025 },
] as const;
export type AudioBandName = (typeof AUDIO_BANDS)[number]["name"];
export type AudioWarning = "AUDIO_CLIPPING" | "AUDIO_FLAT_DYNAMICS" | "AUDIO_LOW_END_DOMINANT" | "AUDIO_SILENT_SPAN";

export interface AudioAnalysis {
  integratedLufs: number; truePeakDbtp: number; lra: number;
  bands: { name: AudioBandName; fromHz: number; toHz: number; share: number }[];
  /** lufs is null for shots shorter than 0.4 s (R-6); onsetDensity is onsets per second inside the shot. */
  perShot: { shotId: string; lufs: number | null; onsetDensity: number }[];
  onsets: number[]; loudestS: number; quietestS: number; warnings: AudioWarning[];
}
export interface AnalyzeAudioInput { video: string; shots: ShotSpan[]; ffmpeg: FfmpegInfo; bpm?: number; beatOffsetS?: number }
/** Implemented by src/analyze/audio.ts; resolves null when the video has no audio stream. */
export type AnalyzeAudioFn = (input: AnalyzeAudioInput) => Promise<AudioAnalysis | null>;

export interface AnalyzeSummary {
  shots: number; asl: number; medianShot: number; cutsOnBeat: number | null; cutsNearOnset: number | null;
  /** Key is the shot length in beats rounded to 0.5, as a string; empty without bpm. */
  beatHistogram: Record<string, number>;
}
export interface AnalyzeArtifacts { dir: string; report: string; keyframes: string; sheets: string[]; sheetIndex: string; spectrogram: string | null }

export interface AnalyzeReport {
  version: 1; video: string; method: AnalyzeMethod; fps: number; durationS: number;
  bpm: number | null; beatOffsetS: number | null;
  shots: AnalyzeShot[]; cuts: AnalyzeCut[]; summary: AnalyzeSummary;
  audio: AudioAnalysis | null; artifacts: AnalyzeArtifacts; warnings: string[];
}
export interface AnalyzeOptions { video: string; timeline?: string; bpm?: number; beatOffsetS?: number; out?: string }
