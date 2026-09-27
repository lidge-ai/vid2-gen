import { Vid2Error } from "../shared/index.ts";
import type { ResolvedTimeline } from "../timeline/index.ts";
import { QA_CHECKS } from "./report.ts";
import type { QaCheck, QaIssue, QaWaiver } from "./report.ts";

/** Merge CLI time ranges and resolved timeline waivers. */
export function parseWaivers(value: string | undefined, timeline?: ResolvedTimeline): QaWaiver[] {
  const result: QaWaiver[] = (timeline?.qa.waivers ?? []).map((waiver) => ({
    check: waiver.check as QaCheck, fromS: waiver.fromS, toS: waiver.toS, reason: waiver.reason, source: "timeline" }));
  if (!value) return result;
  for (const entry of value.split(",")) {
    const match = /^([a-z_]+)@(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(entry.trim());
    if (!match || !(QA_CHECKS as readonly string[]).includes(match[1] ?? "")) {
      throw new Vid2Error("E_INPUT", `Invalid QA waiver: ${entry}`);
    }
    const fromS = Number(match[2]); const toS = Number(match[3]);
    if (toS < fromS) throw new Vid2Error("E_INPUT", `QA waiver ends before it starts: ${entry}`);
    result.push({ check: match[1] as QaCheck, fromS, toS, reason: "CLI waiver", source: "cli" });
  }
  return result;
}

/** Keep an issue as evidence while marking a matching time range waived. */
export function applyWaivers(issues: QaIssue[], waivers: QaWaiver[]): QaIssue[] {
  return issues.map((issue) => {
    const waiver = waivers.find((item) => item.check === issue.check && (!issue.range ||
      item.fromS <= issue.range[0] && item.toS >= issue.range[1]));
    return waiver ? { ...issue, status: "waived", waiver: { reason: waiver.reason, source: waiver.source } } : issue;
  });
}
