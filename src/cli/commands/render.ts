import { resolve } from "node:path";
import { hardwareRequest, renderPlan } from "../../render/index.ts";
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
  name: "render", group: "render",
  examples: ["vid2 render timeline.json --profile proxy -o proxy.mp4","vid2 render timeline.json -o final.mp4 --hw","vid2 render timeline.json --hw-accel required --hw-encoder videotoolbox -o final.mp4","vid2 render timeline.json --segments intro --placeholders"],
  description: "Scenes render as cached segments in parallel, then one final encode. --hw only changes that final encode.",
  summary: "Render a timeline (or compiled plan) to a video file",
  usage: "vid2 render <timeline.json|x.plan.json> [options] [--json]",
  options: {
    out: { type: "string", short: "o", value: "<file.mp4>", description: "Output video path", default: "<timeline>.mp4" },
    profile: { type: "string", value: "<proxy|final>", description: "proxy renders at half size, fast", default: "final" },
    segments: { type: "string", multiple: true, value: "<id>", description: "Force re-render of these scene or segment ids" },
    "no-cache": { type: "boolean", description: "Ignore and do not write the segment cache" },
    hw: { type: "boolean", description: "Shorthand for --hw-accel if-possible" },
    "hw-accel": { type: "string", value: "<disable|if-possible|required>", description: "Final encode on a hardware encoder: if-possible falls back to software, required exits 3", default: "disable" },
    "hw-encoder": { type: "string", value: "<videotoolbox|nvenc|qsv|amf|vaapi>", description: "Limit hardware encoding to one family" },
    jobs: { type: "string", value: "<n>", description: "Parallel segment renders", default: "half the CPUs" },
    placeholders: { type: "boolean", description: "Stand in stripe images for missing media and uncached generated sources (no provider calls)" },
    generate: { type: "boolean", description: "Call asset providers (ima2) for generated sources that are not cached yet" },
  },
  async run({ args, values, cwd, stderr, json }) {
    if (args.length !== 1) throw new Vid2Error("E_INPUT", "render needs one timeline or plan path");
    const { plan, path, warnings: planWarnings } = await loadPlanOrTimeline(args[0], cwd, profileOf(values["profile"]),
      { generate: values["generate"] === true, placeholders: values["placeholders"] === true });
    const out = typeof values["out"] === "string" ? resolve(cwd, values["out"]) : path.replace(/(\.plan)?\.json$/i, "") + ".mp4";
    const controller = new AbortController();
    const onSigint = (): void => controller.abort();
    process.once("SIGINT", onSigint);
    try {
      const n = jobs(values["jobs"]);
      const hw = hardwareRequest({ hw: values["hw"], accel: values["hw-accel"], family: values["hw-encoder"] });
      const result = await renderPlan(plan, { out, signal: controller.signal, noCache: values["no-cache"] === true, hw,
        ...(n === undefined ? {} : { jobs: n }),
        ...(Array.isArray(values["segments"]) ? { segments: values["segments"] as string[] } : {}),
        logger: (e) => { if (!json && e.message) stderr.write(`${e.stage}: ${e.message}\n`); } });
      return { command: "render", data: { output: result.output, seconds: result.seconds, frames: plan.totalFrames, profile: plan.profile,
        width: plan.output.width, height: plan.output.height, segments: result.segments, manifest: result.manifest, encoder: result.encoder,
        ...(result.audio ? { audio: result.audio } : {}) },
        artifacts: [result.output, result.manifest], warnings: [...new Set([...planWarnings, ...(plan.warnings ?? []), ...result.warnings])] };
    } finally {
      process.removeListener("SIGINT", onSigint);
    }
  },
};
