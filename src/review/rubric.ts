import type { ReviewEvidence, ListenResult } from "./types.ts";

export function reviewPrompt(evidence: ReviewEvidence, listen: ListenResult, repair = false): string {
  const { analyze, qa } = evidence;
  const listener = listen.status === "HEARD" ? `listener (second-hand, weak on sub-bass): ${JSON.stringify(listen.reply)}` : "listener: unavailable";
  return `${repair ? "Previous answer failed validation. Return corrected JSON only. " : ""}Review this film using attached frames and the evidence below.
Score narrative, hierarchy, legibility, continuity, motion, audioTiming, technical from 0 to 4 or cannotDetermine.
Return strict JSON: {"scores":{...},"findings":[{"sceneId":string|null,"timeS":number,"severity":"info|warn|critical","category":"narrative|hierarchy|legibility|continuity|motion|audioTiming|technical|mix|lowEnd|timbre|groove|arrangement","source":"frames|dsp|listener","observation":string,"evidence":string,"fix":string}],"limitations":string[]}.
Use sceneId null when there is no authored timeline. Do not invent a scene or a timestamp past ${analyze.durationS}s.
DSP owns loudness, low end and sync; listener owns timbre, groove, arrangement and mood. Listener low-end claims are weak evidence.
Analyze: ${JSON.stringify({ durationS: analyze.durationS, fps: analyze.fps, shots: analyze.shots.map(({ id, sceneId, startS, endS, beats, motion, meanLuma, meanSaturation }) => ({ id, sceneId, startS, endS, beats, motion, meanLuma, meanSaturation })), cuts: analyze.cuts, summary: analyze.summary, audio: analyze.audio, warnings: analyze.warnings })}
QA: ${JSON.stringify(qa)}
${listener}`;
}
