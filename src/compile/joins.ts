import { Vid2Error } from "../shared/index.ts";
import type { Fps } from "../shared/index.ts";
import { TRANSITIONS } from "../timeline/schema.ts";
import { num } from "./escape.ts";
import { GraphBuilder } from "./graph.ts";
import type { JoinPlan, JoinStep } from "./ir.ts";

type JoinSegment = { id: string; frames: number; renderFrames: number };
type JoinTransition = { type: string; frames: number } | null;

function assertInput(segments: JoinSegment[], transitions: JoinTransition[], fps: Fps): void {
  if (!segments.length) throw new Vid2Error("E_INPUT", "join needs at least one segment");
  if (!Number.isInteger(fps.num) || !Number.isInteger(fps.den) || fps.num <= 0 || fps.den <= 0) {
    throw new Vid2Error("E_INPUT", "join needs a positive rational fps");
  }
  if (transitions.length < segments.length - 1) throw new Vid2Error("E_INPUT", "join needs a transition entry for every boundary");
  for (const [index, segment] of segments.entries()) {
    if (!segment.id || !Number.isInteger(segment.frames) || segment.frames <= 0 ||
      !Number.isInteger(segment.renderFrames) ||
      segment.renderFrames < segment.frames + (index === segments.length - 1 ? 0 : 2)) {
      throw new Vid2Error("E_INPUT", `invalid join segment: ${segment.id}`);
    }
  }
}

function transitionAt(transition: JoinTransition, previous: JoinSegment, next: JoinSegment): { type: string; frames: number } {
  if (!transition) return { type: "cut", frames: 0 };
  if (transition.type === "cut") {
    if (transition.frames !== 0) throw new Vid2Error("E_INPUT", "cut transition must have zero frames");
    return { type: "cut", frames: 0 };
  }
  if (!(TRANSITIONS as readonly string[]).includes(transition.type) ||
    !Number.isInteger(transition.frames) || transition.frames < 1 || transition.frames >= Math.min(previous.frames, next.frames)) {
    throw new Vid2Error("E_INPUT", `invalid transition ${transition.type} between ${previous.id} and ${next.id}`);
  }
  return transition;
}

function normalize(graph: GraphBuilder, index: number, fps: Fps): string {
  const rate = `${num(fps.num)}/${num(fps.den)}`;
  return graph.add([`${index}:v`], [`fps=${rate}`, "settb=AVTB", "setpts=PTS-STARTPTS", "format=yuv420p", "setsar=1", "scale=out_range=tv"], `vnorm${index}`);
}

/** Build a frame-exact video join. transitions[i] is segment i's transitionOut; the last is ignored. */
export function planJoin(segments: JoinSegment[], transitions: JoinTransition[], fps: Fps): JoinPlan {
  assertInput(segments, transitions, fps);
  const first = segments[0]!;
  if (segments.length === 1) return { segments, steps: [], totalFrames: first.frames, graph: null };
  const graph = new GraphBuilder();
  const normalized = segments.map((_, index) => normalize(graph, index, fps));
  const steps: JoinStep[] = [];
  let acc = normalized[0]!;
  let visibleFrames = first.frames;
  for (let i = 1; i < segments.length; i++) {
    const previous = segments[i - 1]!;
    const incoming = segments[i]!;
    const transition = transitionAt(transitions[i - 1] ?? null, previous, incoming);
    const offsetFrames = visibleFrames - transition.frames;
    const accLength = visibleFrames;
    if (offsetFrames < 0 || offsetFrames + transition.frames > accLength) {
      throw new Vid2Error("E_INPUT", `join offset exceeds ${previous.id} length`);
    }
    const left = graph.add([acc], [`trim=end_frame=${num(accLength)}`, "setpts=PTS-STARTPTS"], `vleft${i}`);
    const incomingLength = incoming.frames + (i === segments.length - 1 ? 0 : 2);
    const right = graph.add([normalized[i]!], [`trim=end_frame=${num(incomingLength)}`, "setpts=PTS-STARTPTS"], `vright${i}`);
    const kind = transition.type === "cut" ? "concat" : "xfade";
    const filter = kind === "concat" ? "concat=n=2:v=1:a=0" :
      `xfade=transition=${transition.type}:duration=${num(transition.frames * fps.den / fps.num)}:offset=${num(offsetFrames * fps.den / fps.num)}`;
    acc = graph.add([left, right], [filter], `vstep${i}`);
    steps.push(kind === "concat" ? { kind, frames: 0, offsetFrames } :
      { kind, transition: transition.type, frames: transition.frames, offsetFrames });
    visibleFrames += incoming.frames - transition.frames;
  }
  graph.add([acc], [`trim=end_frame=${num(visibleFrames)}`, "setpts=PTS-STARTPTS"], "vjoin");
  return { segments, steps, totalFrames: visibleFrames, graph: graph.toString() };
}
