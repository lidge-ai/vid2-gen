import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { analyzeAudio } from "../analyze/audio.ts";
import { runAnalyze } from "../analyze/run.ts";
import type { FfmpegInfo } from "../probe/index.ts";
import { runQa } from "../qa/run.ts";
import type { ResolvedTimeline } from "../timeline/index.ts";
import type { ReviewOptions, ReviewReport } from "./types.ts";
import { buildEvidence } from "./evidence.ts";
import { reviewPrompt } from "./rubric.ts";
import { listenToVideo } from "./listen.ts";
import { reviewWithModel } from "./client.ts";

export interface RunReviewOptions extends Omit<ReviewOptions, "timeline"> {
  timeline?: ResolvedTimeline; ffmpeg: FfmpegInfo; ffprobe: string;
}

/** QA failure is evidence; only analysis/image-provider failures reject the review. */
export async function runReview(opts: RunReviewOptions): Promise<ReviewReport> {
  const video = resolve(opts.video);
  const out = resolve(opts.out ?? `${video}.review`);
  await mkdir(out, { recursive: true });
  const analyze = await runAnalyze({ video, out: join(out, "analyze"), ffmpeg: opts.ffmpeg,
    ffprobe: opts.ffprobe, analyzeAudio, ...(opts.timeline ? { timeline: opts.timeline } : {}),
    ...(opts.bpm === undefined ? {} : { bpm: opts.bpm }) });
  const qa = await runQa({ video, out: join(out, "qa"), ffmpeg: opts.ffmpeg.path, ffprobe: opts.ffprobe,
    ...(opts.timeline ? { timeline: opts.timeline } : {}) });
  const evidence = await buildEvidence({ analyze, qa, out, ffmpeg: opts.ffmpeg.path });
  const listen = await listenToVideo({ requested: opts.listen === true, video, analyze, ffmpeg: opts.ffmpeg,
    ...(opts.listenExcerptS === undefined ? {} : { excerptS: opts.listenExcerptS }),
    ...(process.env["VID2_REVIEW_AUDIO_BASE_URL"] ? { baseUrl: process.env["VID2_REVIEW_AUDIO_BASE_URL"] } : {}),
    ...(process.env["VID2_REVIEW_AUDIO_MODEL"] ? { model: process.env["VID2_REVIEW_AUDIO_MODEL"] } : {}),
    ...(process.env["VID2_REVIEW_AUDIO_API_KEY"] ? { apiKey: process.env["VID2_REVIEW_AUDIO_API_KEY"] } : {}) });
  const baseUrl = opts.baseUrl ?? process.env["VID2_REVIEW_BASE_URL"];
  const model = opts.model ?? process.env["VID2_REVIEW_MODEL"];
  const common = { version: 1 as const, evidence: join(out, "evidence.json"), listen };
  let report: ReviewReport;
  if (!baseUrl || !model) {
    report = { ...common, status: "SKIPPED", reason: "model_not_configured", model: model || null,
      scores: null, findings: [], limitations: [], usage: null };
  } else {
    const prompt = reviewPrompt(evidence, listen);
    const result = await reviewWithModel({ baseUrl, model, prompt, repairPrompt: reviewPrompt(evidence, listen, true),
      images: evidence.images, analyze, ...(process.env["VID2_REVIEW_API_KEY"] ? { apiKey: process.env["VID2_REVIEW_API_KEY"] } : {}) });
    report = { ...common, status: "REVIEWED", model, ...result };
  }
  await writeFile(join(out, "review.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}
