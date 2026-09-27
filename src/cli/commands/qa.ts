import { dirname, resolve } from "node:path";
import { runQa } from "../../qa/run.ts";
import { locateTools } from "../../probe/index.ts";
import { Vid2Error } from "../../shared/index.ts";
import { loadCaptures } from "../../capture/index.ts";
import { resolveTimeline } from "../../timeline/index.ts";
import type { CommandSpec } from "../registry.ts";
import { loadTimeline } from "./timeline-file.ts";

export const qa: CommandSpec = {
  name: "qa",
  summary: "Check a rendered video and produce a review report",
  usage: "vid2 qa <video> [--timeline t.json] [--out dir] [--waive black@0-0.4] [--expect-audio] [--strict-motion] [--json]",
  options: {
    timeline: { type: "string", description: "Authored timeline for duration, text, events and waivers" },
    out: { type: "string", short: "o", description: "QA artifact directory" },
    waive: { type: "string", description: "Comma-separated check@from-to time waivers" },
    "expect-audio": { type: "boolean", description: "Fail if audio is absent" },
    "strict-motion": { type: "boolean", description: "Treat a frozen interval as a failure" },
  },
  async run({ args, values, cwd }) {
    if (args.length !== 1) throw new Vid2Error("E_INPUT", "qa needs one video path");
    const tools = locateTools();
    let timeline;
    if (typeof values["timeline"] === "string") {
      const loaded = await loadTimeline(values["timeline"], cwd);
      const baseDir = dirname(loaded.path);
      const captures = await loadCaptures(loaded.timeline.sources, baseDir);
      timeline = resolveTimeline(loaded.timeline, { baseDir, ...(captures ? { events: captures.events } : {}) });
    }
    const report = await runQa({ video: resolve(cwd, args[0]!), ffmpeg: tools.ffmpeg, ffprobe: tools.ffprobe,
      ...(timeline ? { timeline } : {}), ...(typeof values["out"] === "string" ? { out: resolve(cwd, values["out"]) } : {}),
      ...(typeof values["waive"] === "string" ? { waive: values["waive"] } : {}),
      expectAudio: values["expect-audio"] === true, strictMotion: values["strict-motion"] === true });
    if (report.status === "fail") throw new Vid2Error("E_QA", "Video QA found open failures",
      { details: { report }, fix: "review qa.json and address or waive the findings" });
    return { command: "qa", data: report as unknown as Record<string, unknown>,
      artifacts: Object.values(report.artifacts), warnings: report.issues.filter((i) => i.status === "open" && i.severity === "warn").map((i) => i.message) };
  },
};
