import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { planFromTimeline } from "../cli/commands/plan-shared.ts";
import { settleTime } from "../stage/springs.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";

const RATE = 48000;

async function plan(timeline: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "vid2-sa-"));
  process.env["VID2_HOME"] ??= join(dir, "home");
  const path = join(dir, "t.json");
  writeFileSync(path, JSON.stringify(timeline));
  return (await planFromTimeline(path, dir, "final")).plan;
}

void test("stage events reach the audio plan on the absolute clock (transition overlap, motion blur rate 3); authored cues win", async (t) => {
  if (!requireFfmpeg(t)) return;
  const p = await plan({ version: 1, output: { width: 320, height: 180, fps: 30 }, audio: { autoCues: true, cues: [{ at: "1.8s", sfx: "preset:click" }] },
    scenes: [{ id: "a", duration: "1s", transition: { type: "fade", duration: "0.5s" } },
      { id: "b", duration: "2s", effects: [{ type: "motionblur", frames: 3 }], layers: [{ type: "stage", start: "0.2s",
        nodes: [{ kind: "rect", key: "r", width: 10, height: 10 }], events: [{ at: "0.3s", kind: "icon" }, { at: "0.8s", kind: "click" }] }] }] });
  const pops = p.audio!.stems.filter((s) => s.path.endsWith("sfx-pop.wav"));
  assert.equal(pops.length, 1);
  // scene b starts at 1 s − 0.5 s = 0.5 s; layer +0.2 s; event +0.3 s → 1.0 s = frame 30.
  assert.ok(Math.abs(pops[0]!.atSample - 30 / 30 * RATE) <= RATE / 30, `pop at ${pops[0]!.atSample}`);
  const clicks = p.audio!.stems.filter((s) => s.path.endsWith("sfx-click.wav"));
  assert.equal(clicks.length, 2, "the auto click at 1.5 s is 300 ms from the authored cue at 1.8 s, so both exist");
  const q = await plan({ version: 1, output: { width: 320, height: 180, fps: 30 }, audio: { autoCues: true, cues: [{ at: "1.03s", sfx: "preset:pop" }] },
    scenes: [{ id: "a", duration: "1s", transition: { type: "fade", duration: "0.5s" } },
      { id: "b", duration: "2s", layers: [{ type: "stage", start: "0.2s", nodes: [{ kind: "rect", key: "r", width: 10, height: 10 }], events: [{ at: "0.3s", kind: "icon" }] }] }] });
  assert.equal(q.audio!.stems.filter((s) => s.path.endsWith("sfx-pop.wav")).length, 1, "an auto cue 30 ms from an authored cue is dropped");
});

void test("kinetic expand emits grow when the plate settles, so the riser ends as the frame fills", async (t) => {
  if (!requireFfmpeg(t)) return;
  const p = await plan({ version: 1, output: { width: 320, height: 180, fps: 30 }, audio: { autoCues: true },
    scenes: [{ id: "k", duration: "3s", layers: [{ type: "kinetic", size: 30, x: 160, y: 90,
      states: [{ at: 0, text: "Open {globe}" }, { at: "1s", text: "{globe}", expand: { token: "icon:globe#0" } }] }] }] });
  const grow = p.stageRenders[0]!.spec.events.find((e) => e.kind === "grow")!;
  const critical = { stiffness: 170, damping: Math.max(22, 2 * Math.sqrt(170)), mass: 1 };
  assert.ok(Math.abs(grow.frame / 30 - (1 + settleTime(critical))) <= 1 / 30, `grow at ${grow.frame / 30}s`);
  const riser = p.audio!.stems.find((s) => s.path.endsWith("sfx-riser.wav"))!;
  assert.ok(Math.abs(riser.atSample + 1.2 * RATE - grow.frame / 30 * RATE) <= RATE / 30 + 1, "riser end anchor = settle frame");
});
