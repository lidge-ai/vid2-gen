/**
 * Turn capture actions into render data for capture layers (030): camera keys for camera {auto: "events"} and a cursor track in
 * canvas pixels (after fit and camera) for layers with a cursor. Runs after resolveTimeline, before compile.
 */
import { Vid2Error } from "../shared/index.ts";
import type { Fps } from "../shared/index.ts";
import type { CaptureEvent, CursorTrackSample, ResolvedLayer, ResolvedTimeline } from "../timeline/index.ts";
import { planCamera } from "./camera.ts";
import type { CameraKeyOut } from "./camera.ts";
import { planCursor } from "./cursor.ts";
import type { CaptureAction, LoadedSession } from "./session.ts";

type Media = Extract<ResolvedLayer, { type: "media" }>;
type Box = { x: number; y: number; width: number; height: number };
interface Fit { s: number; ox: number; oy: number }

function coverFit(session: LoadedSession, width: number, height: number, mode: Media["fit"]): Fit {
  const fw = session.meta.width, fh = session.meta.height;
  const s = mode === "contain" ? Math.min(width / fw, height / fh) : Math.max(width / fw, height / fh);
  return { s, ox: (width - fw * s) / 2, oy: (height - fh * s) / 2 };
}

const mapBox = (b: Box, f: Fit): Box => ({ x: b.x * f.s + f.ox, y: b.y * f.s + f.oy, width: b.width * f.s, height: b.height * f.s });

/** Action frame on the layer-relative timeline clock (030 clock rule), or null outside the layer. */
function layerFrame(a: CaptureAction, session: LoadedSession, layer: Media, fps: Fps): number | null {
  const seconds = (a.frame * session.fps.den) / session.fps.num;
  const frame = Math.round(((seconds - (layer.inSeconds ?? 0)) / layer.speed) * fps.num / fps.den);
  return frame >= 0 && frame < layer.endFrame - layer.startFrame ? frame : null;
}

/** Linear camera state at a layer-relative frame (keys are linear, sampled every ≤2 frames). */
export function cameraAt(keys: CameraKeyOut[], seconds: number): { zoom: number; x: number; y: number } {
  if (!keys.length) return { zoom: 1, x: 0.5, y: 0.5 };
  const i = keys.findIndex((k) => k.at > seconds);
  if (i === 0) return keys[0]!;
  if (i === -1) return keys.at(-1)!;
  const a = keys[i - 1]!, b = keys[i]!;
  const t = (seconds - a.at) / (b.at - a.at);
  return { zoom: a.zoom + (b.zoom - a.zoom) * t, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function cameraKeys(layer: Media, actions: { frame: number; bbox?: Box; point?: { x: number; y: number } }[], t: ResolvedTimeline): CameraKeyOut[] | null {
  const cam = layer.camera;
  if (!cam || Array.isArray(cam)) return null;
  const frames = layer.endFrame - layer.startFrame;
  return planCamera(actions, { fps: t.fps, startFrame: layer.absoluteStartFrame, frames, width: t.width, height: t.height, zoom: cam.zoom,
    ...(typeof cam.hold === "number" ? { hold: cam.hold } : {}) });
}

function cursorTrack(layer: Media, actions: { frame: number; point: { x: number; y: number }; kind: CaptureAction["kind"] }[],
  keys: CameraKeyOut[], t: ResolvedTimeline): CursorTrackSample[] {
  const frames = layer.endFrame - layer.startFrame;
  const samples = planCursor(actions, { fps: t.fps, frames, width: t.width, height: t.height });
  const toOut = (x: number, y: number, seconds: number) => {
    const c = cameraAt(keys, seconds);
    const h = 0.5 / c.zoom;
    return { x: ((x / t.width - (c.x - h)) / (2 * h)) * t.width, y: ((y / t.height - (c.y - h)) / (2 * h)) * t.height };
  };
  return samples.map((s) => {
    const sec = (s.frame * t.fps.den) / t.fps.num;
    const p = toOut(s.x, s.y, sec);
    return { frame: s.frame, x: p.x, y: p.y, scale: s.scale, alpha: s.alpha,
      ripples: s.ripples.map((r) => ({ ...toOut(r.x, r.y, sec), age: r.age })) };
  });
}

function decorate(layer: Media, session: LoadedSession, t: ResolvedTimeline): Media {
  const fit = coverFit(session, t.width, t.height, layer.fit);
  const placed = session.actions.flatMap((a) => {
    const frame = layerFrame(a, session, layer, t.fps);
    if (frame === null) return [];
    const bbox = a.bbox ? mapBox(a.bbox, fit) : undefined;
    const point = a.point ? { x: a.point.x * fit.s + fit.ox, y: a.point.y * fit.s + fit.oy } : undefined;
    return [{ frame, kind: a.kind, ...(bbox ? { bbox } : {}), ...(point ? { point } : {}) }];
  });
  const keys = cameraKeys(layer, placed, t);
  const camera = keys === null ? layer.camera
    : keys.length ? keys.map((k) => ({ at: k.at, zoom: k.zoom, x: k.x, y: k.y, ease: k.ease })) : [{ at: 0, zoom: 1, x: 0.5, y: 0.5, ease: "linear" as const }];
  const out: Media = { ...layer, ...(camera === undefined ? {} : { camera }) };
  const style = layer.cursor?.style;
  if (!style || style === "none" || !session.meta.cursorHidden || layer.window) return out;
  const withPoints = placed.flatMap((a) => (a.point ? [{ frame: a.frame, point: a.point, kind: a.kind }] : []));
  return { ...out, cursorTrack: cursorTrack(layer, withPoints, keys ?? [], t) };
}

/** Actions inside a capture layer's visible span, on the absolute timeline clock (auto cues, 040). */
function layerEvents(layer: Media, session: LoadedSession, t: ResolvedTimeline): CaptureEvent[] {
  return session.actions.flatMap((a) => {
    const frame = layerFrame(a, session, layer, t.fps);
    if (frame === null) return [];
    const endFrame = a.endMs === undefined ? undefined
      : layerFrame({ ...a, frame: Math.round((a.endMs / 1000) * session.fps.num / session.fps.den) }, session, layer, t.fps);
    return [{ frame: layer.absoluteStartFrame + frame, kind: a.kind, sourceId: layer.source, ...(a.label ? { label: a.label } : {}),
      ...(a.chars === undefined ? {} : { chars: a.chars }), ...(endFrame == null ? {} : { endFrame: layer.absoluteStartFrame + endFrame }) }];
  });
}

export function decorateCaptureLayers(t: ResolvedTimeline, sessions: Record<string, LoadedSession>): ResolvedTimeline {
  const captureEvents: CaptureEvent[] = [];
  const scenes = t.scenes.map((scene) => ({ ...scene, layers: scene.layers.map((layer) => {
    if (layer.type !== "media" || t.sources[layer.source]?.type !== "capture") return layer;
    const session = sessions[layer.source];
    if (!session) throw new Vid2Error("E_INTERNAL", `capture session not loaded: ${layer.source}`);
    captureEvents.push(...layerEvents(layer, session, t));
    return decorate(layer, session, t);
  }) }));
  return { ...t, scenes, captureEvents: captureEvents.sort((a, b) => a.frame - b.frame) };
}
