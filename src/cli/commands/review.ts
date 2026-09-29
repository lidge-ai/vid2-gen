import { dirname, join, resolve } from "node:path";
import { loadCaptures } from "../../capture/index.ts";
import { locateTools, probeFfmpeg } from "../../probe/index.ts";
import { runReview } from "../../review/run.ts";
import { Vid2Error } from "../../shared/index.ts";
import { resolveTimeline } from "../../timeline/index.ts";
import type { CommandSpec } from "../registry.ts";
import { loadTimeline } from "./timeline-file.ts";

function numberOption(values: Record<string, unknown>, name: string, max?: number): number | undefined {
  if (values[name] === undefined) return undefined;
  const value = Number(values[name]);
  if (!Number.isFinite(value) || value <= 0 || max !== undefined && value > max) {
    throw new Vid2Error("E_INPUT", `--${name} must be positive${max === undefined ? "" : ` and at most ${max}`}`);
  }
  return value;
}

export const review: CommandSpec = {
  name: "review", group: "review",
  examples: ["vid2 review film.mp4 --timeline timeline.json --json","vid2 review film.mp4 --listen --listen-excerpt 20"],
  description: "Runs analyze, then asks an image model (and optionally a listener) to score the film against a rubric.", summary: "Analyze and review a rendered video with optional model listening",
  usage: "vid2 review <video> [--timeline timeline.json] [options] [--json]",
  options: {
    timeline: { type: "string", value: "<timeline.json>", description: "Authored timeline for scene boundaries" },
    bpm: { type: "string", value: "<bpm>", description: "Beat grid tempo" },
    out: { type: "string", short: "o", value: "<dir>", description: "Review evidence directory", default: "<video>.review" },
    "base-url": { type: "string", value: "<url>", description: "Bare HTTP(S) host for Chat Completions", default: "VID2_REVIEW_BASE_URL" },
    model: { type: "string", value: "<id>", description: "Image review model ID", default: "VID2_REVIEW_MODEL" },
    listen: { type: "boolean", description: "Ask a configured audio model to hear an excerpt" },
    "listen-excerpt": { type: "string", value: "<seconds>", description: "Excerpt length, 1-120", default: "30" },
  },
  async run({ args, values, cwd }) {
    if (args.length !== 1) throw new Vid2Error("E_INPUT", "review needs one video path");
    const tools = locateTools();
    const ffmpeg = await probeFfmpeg({ tools });
    let timeline;
    if (typeof values["timeline"] === "string") {
      const loaded = await loadTimeline(values["timeline"], cwd);
      const baseDir = dirname(loaded.path);
      const captures = await loadCaptures(loaded.timeline.sources, baseDir);
      timeline = resolveTimeline(loaded.timeline, { baseDir, ...(captures ? { events: captures.events } : {}) });
    }
    const bpm = numberOption(values, "bpm");
    const listenExcerptS = numberOption(values, "listen-excerpt", 120);
    const out = typeof values["out"] === "string" ? resolve(cwd, values["out"]) : resolve(cwd, `${args[0]}.review`);
    const report = await runReview({ video: resolve(cwd, args[0]!), out, ffmpeg, ffprobe: tools.ffprobe,
      ...(timeline ? { timeline } : {}), ...(bpm === undefined ? {} : { bpm }),
      ...(listenExcerptS === undefined ? {} : { listenExcerptS }), listen: values["listen"] === true,
      ...(typeof values["base-url"] === "string" ? { baseUrl: values["base-url"] } : {}),
      ...(typeof values["model"] === "string" ? { model: values["model"] } : {}) });
    return { command: "review", data: report as unknown as Record<string, unknown>,
      artifacts: [report.evidence, join(out, "review.json")], warnings: report.listen.status === "UNHEARD" ? [`listener: ${report.listen.reason}`] : [] };
  },
};
