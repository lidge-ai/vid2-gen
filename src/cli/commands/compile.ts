import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Vid2Error } from "../../shared/errors.ts";
import type { CommandSpec } from "../registry.ts";
import { planFromTimeline, profileOf } from "./plan-shared.ts";

export const compile: CommandSpec = {
  name: "compile",
  summary: "Compile a timeline to an ffmpeg render plan",
  usage: "vid2 compile <timeline.json> [--profile proxy|final] [--out plan.plan.json] [--json]",
  options: {
    profile: { type: "string", description: "Render profile: proxy (half size, fast) or final (default)" },
    placeholders: { type: "boolean", description: "Stand in stripe images for missing media and uncached generated sources" },
    out: { type: "string", short: "o", description: "Write the plan JSON to this path (name it *.plan.json)" },
  },
  async run({ args, values, cwd }) {
    if (args.length !== 1) throw new Vid2Error("E_INPUT", "compile needs one timeline path");
    const { plan, warnings } = await planFromTimeline(args[0], cwd, profileOf(values["profile"]), { placeholders: values["placeholders"] === true });
    const artifacts: string[] = [];
    if (typeof values["out"] === "string") {
      const out = resolve(cwd, values["out"]);
      await writeFile(out, JSON.stringify(plan, null, 2) + "\n");
      artifacts.push(out);
    }
    const summary = { profile: plan.profile, output: plan.output, totalFrames: plan.totalFrames, workDir: plan.workDir,
      segments: plan.segments.map((s) => ({ id: s.id, frames: s.frames, renderFrames: s.renderFrames, inputs: s.inputs.length,
        textRuns: s.assFiles.length, internalRate: s.internalRate })),
      join: plan.join.steps, post: { overlays: plan.post.overlays.length, effects: plan.post.effects.map((e) => e.type),
        ...(plan.post.look ? { look: { preset: plan.post.look.preset, strength: plan.post.look.strength } } : {}),
        ...(plan.post.hud ? { hudChunks: plan.post.hud.renders.length } : {}) } };
    return { command: "compile", data: artifacts.length ? summary : { ...summary, plan }, artifacts,
      warnings: [...new Set([...warnings, ...(plan.warnings ?? [])])] };
  },
};
