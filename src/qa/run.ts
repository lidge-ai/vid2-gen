import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Vid2Error } from "../shared/index.ts";
import type { ResolvedTimeline } from "../timeline/index.ts";
import { QA_CHECKS, reportStatus } from "./report.ts";
import type { QaCheck, QaCheckStatus, QaReport } from "./report.ts";
import { createArtifacts } from "./artifacts.ts";
import { runChecks } from "./checks.ts";
import { probeQa } from "./probe.ts";
import { applyWaivers, parseWaivers } from "./waivers.ts";

export interface RunQaOptions { video: string; timeline?: ResolvedTimeline; out?: string; waive?: string;
  expectAudio?: boolean; strictMotion?: boolean; ffmpeg: string; ffprobe: string }

function checkStatuses(issues: QaReport["issues"], skipped: QaCheck[]): Record<QaCheck, QaCheckStatus> {
  const checks = Object.fromEntries(QA_CHECKS.map((name) => [name, skipped.includes(name) ? "skipped" : "pass"])) as Record<QaCheck, QaCheckStatus>;
  for (const item of issues) {
    if (item.status === "waived") continue;
    if (item.severity === "fail") checks[item.check] = "fail";
    else if (checks[item.check] !== "fail") checks[item.check] = "warn";
  }
  return checks;
}

/** Produce an evidence report, including waived issues and artifacts even when status is fail. */
export async function runQa(opts: RunQaOptions): Promise<QaReport> {
  const video = resolve(opts.video);
  const out = resolve(opts.out ?? `${video}.qa`);
  await mkdir(out, { recursive: true });
  let probed: Awaited<ReturnType<typeof probeQa>>;
  try { probed = await probeQa(video, opts.ffprobe); }
  catch (cause) { throw new Vid2Error("E_QA", "Cannot inspect video for QA", { cause, details: { video } }); }
  const { facts, raw } = probed;
  const checked = await runChecks({ video, ffmpeg: opts.ffmpeg, facts,
    ...(opts.timeline ? { timeline: opts.timeline } : {}), ...(opts.expectAudio ? { expectAudio: true } : {}),
    ...(opts.strictMotion ? { strictMotion: true } : {}) });
  const issues = applyWaivers(checked.issues, parseWaivers(opts.waive, opts.timeline));
  const artifacts = await createArtifacts(video, out, facts, opts.ffmpeg, opts.timeline);
  const probePath = join(out, "probe.json");
  await writeFile(probePath, JSON.stringify({ facts, raw }, null, 2) + "\n");
  artifacts["probe"] = probePath;
  const report: QaReport = { version: 1, video, status: reportStatus(issues),
    checks: checkStatuses(issues, checked.skipped), issues, artifacts, facts };
  const reportPath = join(out, "qa.json");
  report.artifacts["report"] = reportPath;
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  return report;
}
