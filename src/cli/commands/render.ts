import { resolve } from "node:path";
import { renderPlan } from "../../render/index.ts";
import { Vid2Error } from "../../shared/errors.ts";
import type { CommandSpec } from "../registry.ts";
import { loadPlanOrTimeline, profileOf } from "./plan-shared.ts";

function jobs(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Vid2Error("E_INPUT", "--jobs must be a positive integer");
  return n;
}

export const render: CommandSpec = {
  name: "render",
  summary: "Render a timeline (or compiled plan) to a video file",
  usage: "vid2 render <timeline.json|x.plan.json> [-o out.mp4] [--profile proxy|final] [--segments id]... [--no-cache] [--hw] [--jobs N] [--json]",
  options: {
    out: { type: "string", short: "o", description: "Output video path (default: <timeline>.mp4)" },
    profile: { type: "string", description: "proxy (half size, fast) or final (default)" },
    segments: { type: "string", multiple: true, description: "Force re-render of these scene or segment ids" },
    "no-cache": { type: "boolean", description: "Ignore and do not write the segment cache" },
    hw: { type: "boolean", description: "Use a hardware H.264 encoder when available (approximate quality)" },
    jobs: { type: "string", description: "Parallel segment renders (default: half the CPUs)" },
  },
  async run({ args, values, cwd, stderr, json }) {
    if (args.length !== 1) throw new Vid2Error("E_INPUT", "render needs one timeline or plan path");
    const { plan, path } = await loadPlanOrTimeline(args[0], cwd, profileOf(values["profile"]));
    const out = typeof values["out"] === "string" ? resolve(cwd, values["out"]) : path.replace(/(\.plan)?\.json$/i, "") + ".mp4";
    const controller = new AbortController();
    const onSigint = (): void => controller.abort();
    process.once("SIGINT", onSigint);
    try {
      const n = jobs(values["jobs"]);
      const result = await renderPlan(plan, { out, signal: controller.signal, noCache: values["no-cache"] === true, hw: values["hw"] === true,
        ...(n === undefined ? {} : { jobs: n }),
        ...(Array.isArray(values["segments"]) ? { segments: values["segments"] as string[] } : {}),
        logger: (e) => { if (!json && e.message) stderr.write(`${e.stage}: ${e.message}\n`); } });
      return { command: "render", data: { output: result.output, seconds: result.seconds, frames: plan.totalFrames, profile: plan.profile,
        width: plan.output.width, height: plan.output.height, segments: result.segments, manifest: result.manifest,
        ...(result.audio ? { audio: result.audio } : {}) },
        artifacts: [result.output, result.manifest], warnings: result.warnings };
    } finally {
      process.removeListener("SIGINT", onSigint);
    }
  },
};
