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
import { existsSync } from "node:fs";
import { materializeSources } from "../../assets/index.ts";
import { holdWarnings } from "../../assets/hold.ts";
import { decorateCaptureLayers, loadCaptures } from "../../capture/index.ts";

export function profileOf(value: unknown): ProfileName {
  if (value === undefined) return "final";
  if (value === "proxy" || value === "final") return value;
  throw new Vid2Error("E_INPUT", `unknown profile: ${JSON.stringify(value)}`, { fix: "use --profile proxy or --profile final" });
}

export interface PlanOptions { generate?: boolean; placeholders?: boolean }
export interface PlanLoad { plan: RenderPlan; path: string; warnings: string[] }

export async function planFromTimeline(file: string | undefined, cwd: string, profile: ProfileName, opts: PlanOptions = {}): Promise<PlanLoad> {
  const { timeline: authored, path } = await loadTimeline(file, cwd);
  const baseDir = dirname(path);
  const captures = await loadCaptures(authored.sources, baseDir);
  const authoredIssues = validateTimeline(authored, { baseDir, ...(captures ? { events: captures.events } : {}) });
  if (authoredIssues.length) throw new Vid2Error("E_INPUT", "timeline validation failed", { details: { issues: authoredIssues } });
  // Generated sources become local image/video files (050): manifest only, unless --generate.
  const mode = opts.generate ? "generate" : opts.placeholders ? "placeholders" : "require";
  const { timeline, warnings, generatedVideos } = await materializeSources(authored, baseDir, { mode });
  const issues = validateTimeline(timeline, { baseDir, ...(captures ? { events: captures.events } : {}) });
  if (issues.length) throw new Vid2Error("E_INPUT", "timeline validation failed", { details: { issues } });
  const base = resolveTimeline(timeline, { baseDir, ...(captures ? { events: captures.events } : {}) });
  const resolved = captures ? decorateCaptureLayers(base, captures.sessions) : base;
  const tools = locateTools();
  const ffmpeg = await probeFfmpeg({ tools });
  const hash = timelineHash(resolved);
  const workDir = join(cacheDir("work"), `${hash.slice(0, 16)}-${profile}`);
  const plan = compileTimeline(resolved, { profile, output: applyProfile(timelineOutput(resolved), profile), workDir, ffmpeg,
    ffprobe: tools.ffprobe, timelineHash: hash, timelinePath: file ?? path });
  plan.warnings = holdWarnings(resolved, generatedVideos);
  return { plan, path, warnings };
}

/** A render input is either a timeline or a plan.json written by vid2 compile. */
export async function loadPlanOrTimeline(file: string | undefined, cwd: string, profile: ProfileName, opts: PlanOptions = {}): Promise<PlanLoad> {
  if (!file) throw new Vid2Error("E_INPUT", "render needs a timeline or plan path");
  if (file.endsWith(".plan.json")) {
    const path = join(cwd, file);
    const raw = JSON.parse(await readFile(path, "utf8")) as RenderPlan;
    // 0.1 plans predate stage clips (010).
    const plan: RenderPlan = { ...raw, warnings: raw.warnings ?? [], stageRenders: raw.stageRenders ?? [],
      segments: raw.segments.map((s) => ({ ...s, stageDeps: s.stageDeps ?? [] })) };
    if (plan.planVersion !== 1) throw new Vid2Error("E_INPUT", "unsupported plan version", { details: { planVersion: plan.planVersion } });
    const stageFiles = plan.stageRenders.flatMap((r) => r.spec.nodes.flatMap((n) => (n.kind === "text" ? [n.font] : n.kind === "image" ? [n.image] : [])));
    const inputs = [...plan.segments.flatMap((s) => s.inputs.flatMap((i) => (i.path ? [i.path] : []))), ...(plan.audio?.stems.map((s) => s.path) ?? []),
      ...stageFiles];
    const renderOutputs = new Set([...(plan.audio?.renders.map((r) => r.out) ?? []), ...plan.stageRenders.map((r) => r.out)]);
    const gone = inputs.find((p) => !renderOutputs.has(p) && !existsSync(p));
    if (gone) throw new Vid2Error("E_NOT_FOUND", `plan input is missing: ${gone}`, { fix: "re-run vid2 compile (and vid2 assets resolve if it was generated)" });
    return { plan, path, warnings: [] };
  }
  return planFromTimeline(file, cwd, profile, opts);
}
