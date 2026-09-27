import { dirname } from "node:path";
import { resolveTimeline, validateTimeline } from "../../timeline/index.ts";
import { framesToSeconds } from "../../shared/time.ts";
import { Vid2Error } from "../../shared/errors.ts";
import type { CommandSpec } from "../registry.ts";
import { loadTimeline } from "./timeline-file.ts";
import { loadCaptures } from "../../capture/index.ts";

export const validate: CommandSpec = {
  name: "validate",
  summary: "Validate a timeline and report its duration",
  usage: "vid2 validate <timeline.json> [--json]",
  options: {},
  async run({ args, cwd }) {
    if (args.length !== 1) throw new Vid2Error("E_INPUT", "validate needs one timeline path");
    const { timeline, path } = await loadTimeline(args[0], cwd);
    const baseDir = dirname(path);
    const captures = await loadCaptures(timeline.sources, baseDir);
    const events = captures ? { events: captures.events } : {};
    const issues = validateTimeline(timeline, { baseDir, ...events });
    if (issues.length) throw new Vid2Error("E_INPUT", "timeline validation failed", { details: { issues } });
    const resolved = resolveTimeline(timeline, { baseDir, ...events });
    return {
      command: "validate",
      data: {
        issues,
        summary: {
          scenes: resolved.scenes.map(({ id, startFrame, frames }) => ({ id, startFrame, frames })),
          totalFrames: resolved.totalFrames,
          totalSeconds: framesToSeconds(resolved.totalFrames, resolved.fps),
        },
      },
    };
  },
};
