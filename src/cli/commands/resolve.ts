import { dirname } from "node:path";
import { resolveTimeline } from "../../timeline/index.ts";
import { Vid2Error } from "../../shared/errors.ts";
import type { CommandSpec } from "../registry.ts";
import { loadTimeline } from "./timeline-file.ts";

export const resolve: CommandSpec = {
  name: "resolve",
  summary: "Resolve symbolic timeline times to frames",
  usage: "vid2 resolve <timeline.json> [--json]",
  options: {},
  async run({ args, cwd }) {
    if (args.length !== 1) throw new Vid2Error("E_INPUT", "resolve needs one timeline path");
    const { timeline, path } = await loadTimeline(args[0], cwd);
    const resolved = resolveTimeline(timeline, { baseDir: dirname(path) });
    return { command: "resolve", data: resolved as unknown as Record<string, unknown> };
  },
};
