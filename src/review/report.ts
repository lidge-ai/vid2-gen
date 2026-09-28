import { FINDING_CATEGORIES, REVIEW_SCORES } from "./types.ts";
import type { AnalyzeReport } from "../analyze/types.ts";
import type { ReviewFinding, ReviewReport, ReviewScore } from "./types.ts";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function score(value: unknown): value is ReviewScore {
  return value === "cannotDetermine" || typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
}

export function safeModelText(value: string, secret?: string): string {
  let text = value.replace(/data:(?:audio|image)\/[\w.+-]+;base64,[A-Za-z0-9+/=]+/gi, "[media redacted]")
    .replace(/[A-Za-z0-9+/]{128,}={0,2}/g, "[encoded bytes redacted]");
  if (secret) text = text.split(secret).join("[key redacted]");
  return text;
}

function finding(value: unknown, analyze: AnalyzeReport, secret?: string): ReviewFinding | null {
  if (!record(value) || !(value.sceneId === null || typeof value.sceneId === "string")
    || typeof value.timeS !== "number" || !Number.isFinite(value.timeS) || value.timeS < 0 || value.timeS > analyze.durationS
    || !["info", "warn", "critical"].includes(String(value.severity))
    || !FINDING_CATEGORIES.includes(value.category as ReviewFinding["category"])
    || !["frames", "dsp", "listener"].includes(String(value.source))
    || ![value.observation, value.evidence, value.fix].every((item) => typeof item === "string")) return null;
  if (value.sceneId !== null && !analyze.shots.some((shot) => shot.sceneId === value.sceneId)) return null;
  const category = value.category as ReviewFinding["category"];
  const source = value.source as ReviewFinding["source"];
  const severity = source === "listener" && category === "lowEnd" ? "info" : value.severity as ReviewFinding["severity"];
  return { sceneId: value.sceneId, timeS: value.timeS, severity, category, source,
    observation: safeModelText(value.observation as string, secret),
    evidence: safeModelText(value.evidence as string, secret), fix: safeModelText(value.fix as string, secret) };
}

/** Parse only the published model fields; reject invented scene references and out-of-film timestamps. */
export function parseReview(text: string, analyze: AnalyzeReport, secret?: string): Pick<ReviewReport, "scores" | "findings" | "limitations"> | null {
  let value: unknown;
  try { value = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/gi, "")) as unknown; }
  catch { return null; }
  if (!record(value) || !record(value.scores) || !Array.isArray(value.findings)
    || !Array.isArray(value.limitations) || !value.limitations.every((item: unknown) => typeof item === "string")) return null;
  if (!REVIEW_SCORES.every((name) => score((value.scores as Record<string, unknown>)[name]))) return null;
  const parsedFindings = value.findings.map((item: unknown) => finding(item, analyze, secret));
  const findings = parsedFindings.filter((item): item is ReviewFinding => item !== null);
  if (findings.length !== parsedFindings.length) return null;
  return { scores: Object.fromEntries(REVIEW_SCORES.map((name) => [name, (value.scores as Record<string, ReviewScore>)[name]])) as ReviewReport["scores"],
    findings, limitations: value.limitations.map((item: string) => safeModelText(item, secret)) };
}
