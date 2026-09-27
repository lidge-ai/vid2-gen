/** Relational checks that cannot be expressed by the authored JSON Schema. */
import { Vid2Error } from "../shared/errors.ts";
import type { Timeline } from "./schema.ts";
import { resolveTimeline } from "./resolve.ts";
import { stageLayerIssues } from "./validate-stage.ts";
import { kineticLayerIssues, kineticTimingIssues } from "./validate-kinetic.ts";
import type { ResolveOptions, ResolvedTimeline, ValidationIssue } from "./types.ts";

function issue(path: string, code: string, message: string): ValidationIssue { return { path, code, message }; }

function sourceIssue(t: Timeline, id: string, path: string, kinds: readonly string[]): ValidationIssue | undefined {
  const source = t.sources[id];
  if (!source) return issue(path, "missing_source", `unknown source: ${id}`);
  const kind = source.type === "generate" ? source.kind : source.type;
  if (!kinds.includes(kind)) return issue(path, "source_kind", `source ${id} must be ${kinds.join(" or ")}`);
  return undefined;
}

function checkReferences(t: Timeline): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (found: ValidationIssue | undefined): void => { if (found) issues.push(found); };
  for (const [id, source] of Object.entries(t.sources)) {
    if (source.type === "generate" && source.kind === "audio") {
      issues.push(issue(`sources.${id}.kind`, "E_INPUT", "audio generation belongs in timeline.audio (vid2 audio generate)"));
    }
  }
  const seen = new Set<string>();
  for (const [si, scene] of t.scenes.entries()) {
    if (seen.has(scene.id)) issues.push(issue(`scenes.${si}.id`, "duplicate_scene", `duplicate scene id: ${scene.id}`));
    seen.add(scene.id);
    if (scene.background && !scene.background.startsWith("#")) add(sourceIssue(t, scene.background, `scenes.${si}.background`, ["image", "video", "color"]));
    for (const [li, layer] of scene.layers.entries()) {
      const path = `scenes.${si}.layers.${li}`;
      if (layer.type === "media") add(sourceIssue(t, layer.source, `${path}.source`, ["image", "video", "capture", "color"]));
      if (layer.type === "overlay") add(sourceIssue(t, layer.source, `${path}.source`, ["image", "video"]));
      if (layer.type === "text" && !["sans", "mono", "serif"].includes(layer.font) && !t.fonts[layer.font]) {
        issues.push(issue(`${path}.font`, "missing_font", `unknown font: ${layer.font}`));
      }
      issues.push(...stageLayerIssues(layer, path, t));
      issues.push(...kineticLayerIssues(layer, path, t));
    }
  }
  for (const [i, layer] of t.overlays.entries()) add(sourceIssue(t, layer.source, `overlays.${i}.source`, ["image", "video"]));
  if (t.audio?.music && "source" in t.audio.music) add(sourceIssue(t, t.audio.music.source, "audio.music.source", ["audio", "video"]));
  for (const [i, voice] of (t.audio?.voice ?? []).entries()) {
    if ("source" in voice) add(sourceIssue(t, voice.source, `audio.voice.${i}.source`, ["audio", "video"]));
  }
  return issues;
}

function checkResolved(r: ResolvedTimeline): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  issues.push(...kineticTimingIssues(r));
  for (const [i, scene] of r.scenes.entries()) {
    if (scene.frames <= 0) issues.push(issue(`scenes.${i}.duration`, "empty_scene", "scene duration must resolve to at least one frame"));
    const next = r.scenes[i + 1];
    if (scene.transitionOut && !next) issues.push(issue(`scenes.${i}.transition`, "last_transition", "last scene cannot transition out"));
    const tr = scene.transitionOut;
    if (tr?.type === "zoomfrom" && !tr.rect) issues.push(issue(`scenes.${i}.transition.rect`, "E_SCHEMA", "zoomfrom needs the rect it grows from"));
    if (tr?.rect && tr.type !== "zoomfrom") issues.push(issue(`scenes.${i}.transition.rect`, "E_SCHEMA", "rect only applies to zoomfrom"));
    if (tr?.center && tr.type !== "iris") issues.push(issue(`scenes.${i}.transition.center`, "E_SCHEMA", "center only applies to iris"));
    if (scene.transitionOut && next && scene.transitionOut.frames >= Math.min(scene.frames, next.frames)) {
      issues.push(issue(`scenes.${i}.transition.duration`, "transition_length", "transition must be shorter than both scenes"));
    }
    for (const [j, layer] of scene.layers.entries()) {
      if (layer.type === "text" && layer.startFrame >= layer.endFrame) {
        issues.push(issue(`scenes.${i}.layers.${j}`, "text_span", "text start must precede end"));
      }
    }
  }
  return issues;
}

/** Returns all independently checkable issues; callers may resolve again for the summary. */
export function validateTimeline(t: Timeline, opts: ResolveOptions = { baseDir: process.cwd() }): ValidationIssue[] {
  const issues = checkReferences(t);
  try { issues.push(...checkResolved(resolveTimeline(t, opts))); }
  catch (error) {
    if (!(error instanceof Vid2Error)) throw error;
    issues.push(issue("timeline", error.code, error.message));
  }
  return issues;
}
