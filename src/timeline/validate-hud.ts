/** Relational look/HUD checks after strict authored parsing and frame resolution. */
import type { Timeline } from "./schema.ts";
import type { ResolvedTimeline, ValidationIssue } from "./types.ts";

const issue = (path: string, code: string, message: string): ValidationIssue => ({ path, code, message });

export function hudAuthoredIssues(t: Timeline): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (t.look?.palette && t.look.preset !== "riso") {
    issues.push(issue("look.palette", "look_palette", "palette is only valid for the riso look"));
  }
  let seen = false;
  for (const [index, overlay] of t.overlays.entries()) {
    if (overlay.type !== "hud") continue;
    if (seen) issues.push(issue(`overlays.${index}`, "HUD_DUPLICATE", "only one root HUD is allowed"));
    if (!["sans", "mono", "serif"].includes(overlay.font) && !t.fonts[overlay.font]) {
      issues.push(issue(`overlays.${index}.font`, "missing_font", `unknown font: ${overlay.font}`));
    }
    seen = true;
  }
  return issues;
}

function orderedFrames(frames: number[], start: number, end: number, path: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [index, value] of frames.entries()) {
    const at = `${path}.${index}.at`;
    if (value < start || value >= end) issues.push(issue(at, "HUD_TIME_RANGE", "time must lie inside the HUD span [start, end)"));
    if (index > 0 && value <= frames[index - 1]!) {
      issues.push(issue(at, "HUD_TIME_ORDER", "times must resolve to strictly increasing, unique frames"));
    }
  }
  return issues;
}

export function hudResolvedIssues(t: Timeline, r: ResolvedTimeline): ValidationIssue[] {
  if (!r.hud) return [];
  const index = t.overlays.findIndex(layer => layer.type === "hud");
  const path = `overlays.${index}`;
  const { startFrame, endFrame, counterKeys, tickerItems } = r.hud;
  const issues: ValidationIssue[] = [];
  if (startFrame >= endFrame) issues.push(issue(path, "HUD_SPAN", "HUD start must precede end"));
  issues.push(...orderedFrames(counterKeys.map(key => key.frame), startFrame, endFrame, `${path}.counter.keys`));
  issues.push(...orderedFrames(tickerItems.map(item => item.frame), startFrame, endFrame, `${path}.ticker.items`));
  return issues;
}
