import { dirname } from "node:path";
import { resolveTimeline } from "../../timeline/index.ts";
import { Vid2Error } from "../../shared/errors.ts";
import type { CommandSpec } from "../registry.ts";
import { loadTimeline } from "./timeline-file.ts";
import { decorateCaptureLayers, loadCaptures } from "../../capture/index.ts";
import { materializeSources } from "../../assets/index.ts";

export const resolve: CommandSpec = {
  name: "resolve", group: "author",
  examples: ["vid2 resolve timeline.json --json"],
  summary: "Resolve symbolic timeline times to frames",
  usage: "vid2 resolve <timeline.json> [--json]",
  options: {},
  async run({ args, cwd }) {
    if (args.length !== 1) throw new Vid2Error("E_INPUT", "resolve needs one timeline path");
    const { timeline, path } = await loadTimeline(args[0], cwd);
    const captures = await loadCaptures(timeline.sources, dirname(path));
    const status = await materializeSources(timeline, dirname(path), { mode: "status" });
    const base = resolveTimeline(status.timeline, { baseDir: dirname(path), ...(captures ? { events: captures.events } : {}) });
    const resolved = captures ? decorateCaptureLayers(base, captures.sessions) : base;
    return { command: "resolve", data: { ...(resolved as unknown as Record<string, unknown>), assets: status.assets } };
  },
};
