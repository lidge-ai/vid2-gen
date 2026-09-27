/** QA report contract (060): an evidence report; exit 6 only for open "fail" issues. */
export const QA_CHECKS = ["format", "duration", "black", "frozen", "silence", "loudness", "av_sync", "text_safe", "contrast"] as const;
export type QaCheck = (typeof QA_CHECKS)[number];
export type QaSeverity = "fail" | "warn";
export type QaCheckStatus = "pass" | "warn" | "fail" | "skipped";

export interface QaIssue {
  id: string; check: QaCheck; severity: QaSeverity; status: "open" | "waived"; code: string; message: string;
  measured?: number | string; threshold?: number | string; range?: [number, number]; fix: string;
  waiver?: { reason: string; source: "cli" | "timeline" };
}
export interface QaFacts {
  container: string; codec: string; pixFmt: string; width: number; height: number; fps: string; frames: number; durationS: number;
  faststart?: boolean; audio?: { codec: string; durationS: number; integrated?: number; truePeak?: number; lra?: number };
}
export interface QaReport {
  version: 1; video: string; status: "pass" | "warn" | "fail"; checks: Record<QaCheck, QaCheckStatus>; issues: QaIssue[];
  artifacts: Record<string, string>; facts: QaFacts;
}
export interface QaWaiver { check: QaCheck; fromS: number; toS: number; reason: string; source: "cli" | "timeline" }

/** Severity table (audit wp7 round 1): which checks fail vs warn. */
export const SEVERITY: Record<QaCheck, QaSeverity> = {
  format: "fail", duration: "fail", black: "fail", av_sync: "fail", loudness: "warn", frozen: "warn", silence: "warn", text_safe: "warn", contrast: "warn",
};

export function reportStatus(issues: QaIssue[]): QaReport["status"] {
  const open = issues.filter((i) => i.status === "open");
  if (open.some((i) => i.severity === "fail")) return "fail";
  return open.length ? "warn" : "pass";
}

export interface PreviewRequest { timeline: string; at: string[]; out: string; profile: "proxy" | "final"; placeholders: boolean; segmentOnly: boolean }
export interface PreviewFrame { at: string; frame: number; seconds: number; scenes: string[]; window: { startFrame: number; endFrame: number };
  composition: "final" | "segment"; path: string }
export interface PreviewResult { frames: PreviewFrame[]; warnings: string[] }
