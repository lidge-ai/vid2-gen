#!/usr/bin/env node
// Sound-and-motion checks for the ima2 launch film (050): cue anchors, stage event spacing, onsets in the final mix, typing cadence.
// Usage (source checkout): node check-sync.mjs <plan.json> <final.mp4> [--until 9]
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { SFX_PRESETS } from "../../src/audio/sfx/presets.ts";
import { ONSET_SAMPLE_RATE, onsetTimes } from "../../src/audio/beats.ts";
import { frameItems } from "../../src/stage/scene.ts";
import { SpriteCache } from "../../src/stage/sprites.ts";
import { indexTracks } from "../../src/stage/tracks.ts";

const [planPath, video] = process.argv.slice(2);
const until = Number(process.argv[process.argv.indexOf("--until") + 1] ?? 9) || 9;
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const RATE = 48000;
const frame = RATE * plan.output.fps.den / plan.output.fps.num;
const ledger = plan.audio?.autoCues ?? [];
const stems = new Map(plan.audio.stems.map((s) => [s.id, s]));
const offset = (sfx) => { const p = SFX_PRESETS[sfx]; return p.anchor === "start" ? 0 : Math.round((p.anchor === "peak" ? p.peakS : p.durationS) * RATE); };

const anchorErrors = ledger.filter((c) => { const s = stems.get(c.stem); return !s || Math.abs((s.atSample + (s.skipSamples ?? 0)) + offset(c.sfx) - c.anchorSample) > frame; });

// Each stage render's cues must keep its events' spacing: find the offset (the layer's start) that maps events onto cues, then count misses.
const spacingErrors = [];
const tol = 1.5 * plan.output.fps.den / plan.output.fps.num;
for (const render of plan.stageRenders) {
  const times = ledger.filter((c) => c.source === render.id).map((c) => c.anchorSample / RATE).sort((a, b) => a - b);
  if (!times.length) continue;
  const events = render.spec.events.map((ev) => ev.frame * render.spec.fps.den / render.spec.fps.num);
  let best = 0;
  for (const ev of events) {
    const o = times[0] - ev;
    best = Math.max(best, times.filter((t) => events.some((v) => Math.abs(v + o - t) <= tol)).length);
  }
  if (best < times.length) spacingErrors.push({ source: render.id, misses: times.length - best });
}

const decoded = spawnSync("ffmpeg", ["-v", "error", "-i", video, "-t", String(until), "-ac", "1", "-ar", String(ONSET_SAMPLE_RATE), "-f", "f32le", "pipe:1"], { maxBuffer: 1 << 28 });
const pcm = new Float32Array(decoded.stdout.buffer, decoded.stdout.byteOffset, decoded.stdout.length / 4);
// 20 ms peak picking: typing ticks often sit 40–60 ms after a hi-hat of the 120 BPM bed and would merge at 50 ms.
const onsets = onsetTimes(pcm, 1.0, 0.02);
const early = ledger.filter((c) => ["type", "pop", "click"].includes(c.sfx) && c.anchorSample / RATE < until);
const hit = early.filter((c) => onsets.some((t) => Math.abs(t - c.anchorSample / RATE) <= 0.03));

const cadence = [];
for (const render of plan.stageRenders) {
  const glyphs = render.spec.nodes.filter((n) => /^fld:g\d+$/.test(n.key)).map((n) => n.key);
  if (glyphs.length < 8) continue;
  const index = indexTracks(render.spec.tracks); const sprites = new SpriteCache(); const set = new Set(glyphs);
  const counts = [];
  for (let f = 0; f < render.frames; f++) counts.push(frameItems(render.spec, index, f, sprites).filter((i) => set.has(i.key) && i.opacity > 0.5).length);
  const firstFull = counts.findIndex((c) => c === glyphs.length);
  const start = counts.findIndex((c) => c > 0);
  const steps = []; let last = start;
  for (let f = start + 1; f <= firstFull; f++) if (counts[f] > counts[f - 1]) { steps.push(f - last); last = f; }
  const fps = render.spec.fps.num / render.spec.fps.den;
  cadence.push({ id: render.id, glyphs: glyphs.length, msPerGlyph: Math.round(((firstFull - start) / fps / (glyphs.length - 1)) * 1000), maxGapFrames: Math.max(...steps) });
}

const report = { cues: ledger.length, anchorErrors: anchorErrors.length, spacingErrors: spacingErrors.length, earlyCues: early.length,
  onsetMatched: hit.length, onsetRatio: early.length ? Number((hit.length / early.length).toFixed(2)) : null, cadence };
console.log(JSON.stringify(report, null, 2));
const ok = ledger.length >= 30 && anchorErrors.length === 0 && spacingErrors.length === 0 && (report.onsetRatio ?? 0) >= 0.7 &&
  cadence.every((c) => c.maxGapFrames <= 2 && c.msPerGlyph >= 25 && c.msPerGlyph <= 50);
process.exit(ok ? 0 : 1);
