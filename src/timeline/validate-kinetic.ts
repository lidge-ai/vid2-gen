/** Relational checks for kinetic layers (020): icons resolve, states ordered inside the span, expand names a live icon token. */
import { iconPaths } from "../stage/icons/lucide.ts";
import { assignKeys, tokenize } from "../stage/presets/tokens.ts";
import { parseTimeLiteral, toFrames } from "../shared/time.ts";
import type { Timeline } from "./schema.ts";
import type { ResolvedTimeline, ValidationIssue } from "./types.ts";

type Layer = Timeline["scenes"][number]["layers"][number];
type Kinetic = Extract<Layer, { type: "kinetic" }>;
const issue = (path: string, message: string): ValidationIssue => ({ path, code: "E_SCHEMA", message });

function kineticIssues(layer: Kinetic, path: string, t: Timeline): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  layer.states.forEach((state, i) => {
    const tokens = assignKeys(state.tokens ?? tokenize(state.text ?? ""));
    if (!tokens.length) issues.push(issue(`${path}.states.${i}`, "a kinetic state needs at least one token"));
    const keys = tokens.map((k) => k.key);
    const dup = keys.find((k, j) => keys.indexOf(k) !== j);
    if (dup) issues.push(issue(`${path}.states.${i}`, `duplicate token key in one state: ${dup}`));
    tokens.forEach((token) => {
      if (token.icon === undefined || iconPaths(token.icon) || t.sources[token.icon]?.type === "image") return;
      issues.push(issue(`${path}.states.${i}`, `unknown icon: ${token.icon} (built-in name or image source id)`));
    });
    if (state.expand && !assignKeys(layer.states[i - 1]?.tokens ?? tokenize(layer.states[i - 1]?.text ?? "")).some((k) => k.key === state.expand!.token)) {
      issues.push(issue(`${path}.states.${i}.expand.token`, `expand names a token that is not on screen: ${state.expand.token}`));
    }
  });
  if (!["sans", "mono", "serif"].includes(layer.font) && !t.fonts[layer.font]) issues.push(issue(`${path}.font`, `unknown font: ${layer.font}`));
  return issues;
}

export function kineticLayerIssues(layer: Layer, path: string, t: Timeline): ValidationIssue[] {
  return layer.type === "kinetic" ? kineticIssues(layer, path, t) : [];
}

/** State times on the resolved frame grid (any time unit, beats included): in order and inside the layer span. */
export function kineticTimingIssues(r: ResolvedTimeline): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const grid = { fps: r.fps, ...(r.beat ? { beat: r.beat } : {}) };
  r.scenes.forEach((scene, si) => scene.layers.forEach((layer, li) => {
    if (layer.type !== "kinetic") return;
    const span = layer.endFrame - layer.startFrame;
    let previous = -1;
    layer.states.forEach((state, i) => {
      const frame = toFrames(parseTimeLiteral(state.at), grid, "duration");
      const path = `scenes.${si}.layers.${li}.states.${i}.at`;
      if (frame < previous) issues.push(issue(path, "kinetic states must be in time order"));
      if (frame >= span) issues.push(issue(path, "kinetic state starts at or after the layer end"));
      previous = frame;
    });
  }));
  return issues;
}
