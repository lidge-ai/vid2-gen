/** EventResolver over capture sessions: footage clock for a capture layer's in/out, timeline clock for everything else. */
import { Vid2Error } from "../shared/index.ts";
import type { CapturePlacement, EventResolver } from "../timeline/index.ts";
import { findAction } from "./session.ts";
import type { LoadedSession } from "./session.ts";

type Ref = { event: string; source?: string };

export function createCaptureResolver(sessions: Record<string, LoadedSession>): EventResolver {
  const placements = new Map<string, CapturePlacement>();
  const pick = (ref: Ref): [string, LoadedSession] => {
    const ids = Object.keys(sessions);
    const id = ref.source ?? (ids.length === 1 ? ids[0] : undefined);
    if (id === undefined) throw new Vid2Error("E_INPUT", `event "${ref.event}" needs a source: the timeline has ${ids.length} capture sources`,
      { details: { sources: ids }, fix: 'add "source": "<capture source id>" to the event reference' });
    const session = sessions[id];
    if (!session) throw new Vid2Error("E_INPUT", `unknown capture source: ${id}`, { details: { sources: ids } });
    return [id, session];
  };
  const footageSeconds = (ref: Ref): { seconds: number; sourceId: string } => {
    const [id, session] = pick(ref);
    const action = findAction(session.actions, ref.event);
    if (!action) throw new Vid2Error("E_INPUT", `unknown event "${ref.event}" in capture source ${id}`, {
      details: { events: session.actions.map((a) => a.label ?? a.id) } });
    return { seconds: (action.frame * session.fps.den) / session.fps.num, sourceId: id };
  };
  return {
    footageSeconds,
    place(sourceId, p) { if (!placements.has(sourceId)) placements.set(sourceId, p); },
    resolve(ref) {
      const { seconds, sourceId } = footageSeconds(ref);
      const p = placements.get(sourceId);
      if (!p) throw new Vid2Error("E_INPUT", `capture source ${sourceId} is not used by any media layer, so its events have no timeline time`);
      const frame = p.startFrame + Math.round(((seconds - p.inSeconds) / p.speed) * p.fps.num / p.fps.den);
      return { frame: Math.max(0, frame), sourceId };
    },
  };
}
