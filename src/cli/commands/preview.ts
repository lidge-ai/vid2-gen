/** vid2 preview: frame-accurate stills from the compiled final composition. */
import { writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve as resolvePath } from "node:path";
import { loadCaptures } from "../../capture/index.ts";
import { preview as renderPreview } from "../../qa/preview.ts";
import { parseTimeLiteral, toFrames, Vid2Error } from "../../shared/index.ts";
import { resolveTimeline } from "../../timeline/index.ts";
import type { ResolvedTimeline } from "../../timeline/index.ts";
import type { CommandResult } from "../output.ts";
import type { CommandSpec } from "../registry.ts";
import { planFromTimeline, profileOf } from "./plan-shared.ts";
import { loadTimeline } from "./timeline-file.ts";

function timeFrame(token: string, total: number, resolved: ResolvedTimeline,
  eventFrame?: (name: string) => number): number {
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(token);
  if (percent) {
    const value = Number(percent[1]);
    if (value < 0 || value > 100) throw new Vid2Error("E_INPUT", `invalid preview percent: ${token}`);
    return Math.min(total - 1, Math.round(total * value / 100));
  }
  const marker = resolved.markers[token];
  if (marker) return marker.frame;
  if (/^\d+(?:\.\d+)?(?:s|ms|f|bar|b)?$/.test(token)) {
    const literal = /^\d+(?:\.\d+)?$/.test(token) ? Number(token) : token;
    return toFrames(parseTimeLiteral(literal), { fps: resolved.fps, ...(resolved.beat ? { beat: resolved.beat } : {}) }, "position");
  }
  if (eventFrame) return eventFrame(token);
  throw new Vid2Error("E_INPUT", `unknown preview time, marker or event: ${token}`);
}

async function namedTimes(path: string, cwd: string): Promise<{ resolved: ResolvedTimeline; eventFrame?: (name: string) => number }> {
  const { timeline } = await loadTimeline(path, cwd);
  const baseDir = dirname(path);
  const captures = await loadCaptures(timeline.sources, baseDir);
  const resolved = resolveTimeline(timeline, { baseDir, ...(captures ? { events: captures.events } : {}) });
  return { resolved, ...(captures ? { eventFrame: (name: string) => captures.events.resolve({ event: name }).frame } : {}) };
}

export const preview: CommandSpec = {
  name: "preview",
  summary: "Render storyboard stills at timeline times, markers or capture events",
  usage: "vid2 preview <timeline> --at 0,25%,1.5s,drop,click#2 [--out dir] [--profile proxy|final] [--placeholders] [--segment-only] [--json]",
  options: {
    at: { type: "string", description: "comma-separated seconds, frames, beats, bars, percent, marker or event" },
    out: { type: "string", short: "o", description: "stills output directory" },
    profile: { type: "string", description: "proxy (default) or final" },
    placeholders: { type: "boolean", description: "substitute missing media without calling providers" },
    "segment-only": { type: "boolean", description: "show the bare scene segment" },
  },
  async run({ args, values, cwd }): Promise<CommandResult> {
    if (args.length !== 1) throw new Vid2Error("E_INPUT", "preview needs one timeline path");
    const raw = values["at"];
    if (typeof raw !== "string" || !raw.trim()) throw new Vid2Error("E_INPUT", "preview needs --at with one or more times");
    const tokens = raw.split(",").map((item) => item.trim());
    if (tokens.some((item) => !item)) throw new Vid2Error("E_INPUT", "preview --at contains an empty time");
    const profile = profileOf(values["profile"] ?? "proxy");
    const { plan, path, warnings } = await planFromTimeline(args[0], cwd, profile, { placeholders: values["placeholders"] === true });
    const { resolved, eventFrame } = await namedTimes(path, cwd);
    const frames = tokens.map((token) => timeFrame(token, plan.totalFrames, resolved, eventFrame));
    const output = typeof values["out"] === "string" ? resolvePath(cwd, values["out"]) :
      join(dirname(path), `${basename(path, extname(path))}.preview`);
    const stills = await renderPreview(plan, frames, { out: output, segmentOnly: values["segment-only"] === true });
    const named = stills.map((still, index) => ({ ...still, at: tokens[index]! }));
    const manifest = join(output, "preview.json");
    await writeFile(manifest, JSON.stringify({ version: 1, frames: named, warnings }, null, 2) + "\n");
    return { command: "preview", data: { frames: named, preview: manifest },
      artifacts: [...named.map((item) => item.path), manifest], warnings };
  },
};
