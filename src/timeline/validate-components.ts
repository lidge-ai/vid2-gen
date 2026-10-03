/** Component event anchors use output frames; ordering and periods retain authored seconds. */
import { Vid2Error } from "../shared/errors.ts";
import { parseTimeLiteral, toFrames, toSeconds } from "../shared/time.ts";
import type { ResolvedLayer, ResolvedTimeline, ValidationIssue } from "./types.ts";

type Component = Extract<ResolvedLayer, { type: "field" | "bars" | "ticker" | "chips" }>;
type Grid = Pick<ResolvedTimeline, "fps" | "beat">;
type Event = { value: number | string; path: string };

function eventStarts(layer: Component, path: string): Event[] {
  if (layer.type === "bars" || layer.type === "ticker") return [{ value: layer.delay, path: `${path}.delay` }];
  if (layer.type === "chips") return layer.items.map((item, i) => ({ value: item.at, path: `${path}.items.${i}.at` }));
  const events = layer.typing.map((entry, i) => ({ value: entry.at, path: `${path}.typing.${i}.at` }));
  if (layer.clear !== undefined) events.push({ value: layer.clear, path: `${path}.clear` });
  if (layer.mask) events.push({ value: layer.mask.at, path: `${path}.mask.at` });
  if (layer.cursor) {
    events.push({ value: layer.cursor.at, path: `${path}.cursor.at` });
    if (layer.cursor.click !== undefined) events.push({ value: layer.cursor.click, path: `${path}.cursor.click` });
  }
  return events;
}

function eventTime(event: Event, grid: Grid, issues: ValidationIssue[]): { frame: number; seconds: number } | undefined {
  try {
    const literal = parseTimeLiteral(event.value);
    return { frame: toFrames(literal, grid, "duration"), seconds: toSeconds(literal, grid) };
  } catch (error) {
    if (!(error instanceof Vid2Error)) throw error;
    issues.push({ path: event.path, code: error.code, message: error.message });
    return undefined;
  }
}

function layerIssues(layer: Component, path: string, grid: Grid): ValidationIssue[] {
  const span = layer.endFrame - layer.startFrame;
  if (span <= 0) return [{ path, code: "COMPONENT_SPAN", message: "component start must precede end by at least one frame" }];
  const issues: ValidationIssue[] = [];
  let previous: number | undefined;
  eventStarts(layer, path).forEach((event, i) => {
    const time = eventTime(event, grid, issues);
    if (!time) return;
    if (time.frame < 0 || time.frame >= span) {
      issues.push({ path: event.path, code: "COMPONENT_TIME_RANGE", message: "component event must start inside the layer span" });
    }
    if (layer.type === "field" && i < layer.typing.length) {
      if (previous !== undefined && time.seconds <= previous) {
        issues.push({ path: event.path, code: "FIELD_TIME_ORDER", message: "field typing starts must strictly increase in time" });
      }
      previous = time.seconds;
    }
  });
  if (layer.type === "ticker") {
    const intervalPath = `${path}.interval`;
    const time = eventTime({ value: layer.interval, path: intervalPath }, grid, issues);
    if (time && time.seconds <= 0) issues.push({ path: intervalPath, code: "TICKER_INTERVAL", message: "ticker interval must be positive" });
  }
  return issues;
}

/** Pure relational checks; generated animation tails may intentionally extend past a cut. */
export function componentTimingIssues(r: ResolvedTimeline): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const grid = { fps: r.fps, ...(r.beat ? { beat: r.beat } : {}) };
  r.scenes.forEach((scene, si) => scene.layers.forEach((layer, li) => {
    if (layer.type !== "field" && layer.type !== "bars" && layer.type !== "ticker" && layer.type !== "chips") return;
    issues.push(...layerIssues(layer, `scenes.${si}.layers.${li}`, grid));
  }));
  return issues;
}
