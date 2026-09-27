/** Relational checks for stage layers (010): unique keys, parent/track references, prop types and sources. */
import type { Timeline } from "./schema.ts";
import { COLOR_PROPS } from "./stage-schema.ts";
import type { ValidationIssue } from "./types.ts";

type Layer = Timeline["scenes"][number]["layers"][number];
type StageLayer = Extract<Layer, { type: "stage" }>;
const BUILTIN_FONTS = ["sans", "mono", "serif"];
const PROPS_BY_KIND: Record<string, readonly string[]> = {
  text: ["color", "reveal"], image: ["width", "height", "radius"], rect: ["width", "height", "radius", "fill", "stroke", "strokeWidth"],
  group: [], icon: ["color", "progress", "strokeWidth"],
};
const COMMON = ["x", "y", "scale", "scaleX", "scaleY", "rotation", "opacity", "blur"];

const issue = (path: string, message: string): ValidationIssue => ({ path, code: "E_SCHEMA", message });

function nodeIssues(layer: StageLayer, path: string, t: Timeline): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const kinds = new Map<string, string>();
  layer.nodes.forEach((node, i) => {
    if (kinds.has(node.key)) issues.push(issue(`${path}.nodes.${i}.key`, `duplicate stage node key: ${node.key}`));
    kinds.set(node.key, node.kind);
    if (node.kind === "image") {
      const source = t.sources[node.source];
      const kind = source?.type === "generate" ? source.kind : source?.type;
      if (kind !== "image") issues.push(issue(`${path}.nodes.${i}.source`, `stage image nodes need an image source: ${node.source}`));
    }
    if (node.kind === "text" && !BUILTIN_FONTS.includes(node.font) && !t.fonts[node.font]) {
      issues.push(issue(`${path}.nodes.${i}.font`, `unknown font: ${node.font}`));
    }
  });
  layer.nodes.forEach((node, i) => {
    if (node.parent && kinds.get(node.parent) !== "group") issues.push(issue(`${path}.nodes.${i}.parent`, `parent must be a group node: ${node.parent}`));
  });
  return [...issues, ...trackIssues(layer, path, kinds)];
}

function trackIssues(layer: StageLayer, path: string, kinds: Map<string, string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  layer.tracks.forEach((track, i) => {
    const kind = kinds.get(track.node);
    if (!kind) { issues.push(issue(`${path}.tracks.${i}.node`, `track targets an unknown node: ${track.node}`)); return; }
    if (!COMMON.includes(track.prop) && !PROPS_BY_KIND[kind]!.includes(track.prop)) {
      issues.push(issue(`${path}.tracks.${i}.prop`, `${kind} nodes cannot animate ${track.prop}`));
    }
    const wantsColor = COLOR_PROPS.includes(track.prop);
    track.keys.forEach((key, k) => {
      if ((typeof key.value === "string") !== wantsColor) {
        issues.push(issue(`${path}.tracks.${i}.keys.${k}.value`, `${track.prop} needs a ${wantsColor ? "colour string" : "number"}`));
      }
    });
  });
  return issues;
}

export function stageLayerIssues(layer: Layer, path: string, t: Timeline): ValidationIssue[] {
  return layer.type === "stage" ? nodeIssues(layer, path, t) : [];
}
