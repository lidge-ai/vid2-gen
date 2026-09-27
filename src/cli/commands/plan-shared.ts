/** Shared compile pipeline for the compile and render commands: load → validate → resolve → profile → plan. */
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { compileTimeline, timelineHash, timelineOutput } from "../../compile/index.ts";
import type { ProfileName, RenderPlan } from "../../compile/index.ts";
import { locateTools, probeFfmpeg } from "../../probe/index.ts";
import { applyProfile } from "../../render/index.ts";
import { cacheDir, Vid2Error } from "../../shared/index.ts";
import { resolveTimeline, validateTimeline } from "../../timeline/index.ts";
import { loadTimeline } from "./timeline-file.ts";

export function profileOf(value: unknown): ProfileName {
  if (value === undefined) return "final";
  if (value === "proxy" || value === "final") return value;
  throw new Vid2Error("E_INPUT", `unknown profile: ${JSON.stringify(value)}`, { fix: "use --profile proxy or --profile final" });
}

export async function planFromTimeline(file: string | undefined, cwd: string, profile: ProfileName): Promise<{ plan: RenderPlan; path: string }> {
  const { timeline, path } = await loadTimeline(file, cwd);
  const baseDir = dirname(path);
  const issues = validateTimeline(timeline, { baseDir });
  if (issues.length) throw new Vid2Error("E_INPUT", "timeline validation failed", { details: { issues } });
  const resolved = resolveTimeline(timeline, { baseDir });
  const tools = locateTools();
  const ffmpeg = await probeFfmpeg({ tools });
  const hash = timelineHash(resolved);
  const workDir = join(cacheDir("work"), `${hash.slice(0, 16)}-${profile}`);
  const plan = compileTimeline(resolved, { profile, output: applyProfile(timelineOutput(resolved), profile), workDir, ffmpeg,
    ffprobe: tools.ffprobe, timelineHash: hash });
  return { plan, path };
}

/** A render input is either a timeline or a plan.json written by vid2 compile. */
export async function loadPlanOrTimeline(file: string | undefined, cwd: string, profile: ProfileName): Promise<{ plan: RenderPlan; path: string }> {
  if (!file) throw new Vid2Error("E_INPUT", "render needs a timeline or plan path");
  if (file.endsWith(".plan.json")) {
    const path = join(cwd, file);
    const plan = JSON.parse(await readFile(path, "utf8")) as RenderPlan;
    if (plan.planVersion !== 1) throw new Vid2Error("E_INPUT", "unsupported plan version", { details: { planVersion: plan.planVersion } });
    return { plan, path };
  }
  return planFromTimeline(file, cwd, profile);
}
