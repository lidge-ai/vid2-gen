import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { HudOverlay } from "../../timeline/film.ts";
import type { ResolvedHud } from "../../timeline/film.ts";
import type { ResolvedTimeline } from "../../timeline/index.ts";
import { evaluateTextNode } from "../../stage/scene.ts";
import { indexTracks, nodeAt } from "../../stage/tracks.ts";
import type { StageSpec, TextNode } from "../../stage/types.ts";
import { GraphBuilder } from "../graph.ts";
import type { StageRender } from "../ir.ts";
import { inputRegistry } from "../segment.ts";
import type { SegmentBase } from "../segment.ts";
import { hudRenders, placeHud } from "./hud.ts";

const hud: ResolvedHud = { ...HudOverlay.parse({ type: "hud", label: "REC", counter: { keys: [{ at: "0s", value: 30 },
  { at: "89f", value: 99.9 }], decimals: 1 }, timecode: { mode: "elapsed" },
  ticker: { items: [{ at: "0s", text: "first" }, { at: "45f", text: "second" }] } }),
  startFrame: 0, endFrame: 90, startSeconds: 0, endSeconds: 3, absoluteStartFrame: 0, absoluteEndFrame: 90,
  absoluteStartSeconds: 0, absoluteEndSeconds: 3,
  counterKeys: [{ frame: 0, value: 30 }, { frame: 89, value: 99.9 }],
  tickerItems: [{ frame: 0, text: "first" }, { frame: 45, text: "second" }] };

function textAt(spec: StageSpec, key: string, frame: number): string {
  const found = spec.nodes.find((n) => n.key === key);
  assert.ok(found?.kind === "text");
  return (evaluateTextNode(nodeAt(found, indexTracks(spec.tracks), frame, spec.fps), frame) as TextNode).text;
}

function opacityAt(spec: StageSpec, key: string, frame: number): number {
  const found = spec.nodes.find((n) => n.key === key);
  assert.ok(found?.kind === "text");
  return nodeAt(found, indexTracks(spec.tracks), frame, spec.fps).opacity;
}

void test("HUD chunks register contiguously and preserve evaluator values across boundaries", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "vid2-hud-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const stages = new Map<string, StageRender>();
  const base: SegmentBase = { width: 320, height: 180, scale: 1, oversample: 1, profile: "proxy", fps: { num: 30, den: 1 },
    background: "#000000", sources: {}, fonts: {}, workDir: dir, pngDir: dir, textBackend: "raster", stages };
  const timeline = { totalFrames: 90 } as ResolvedTimeline;
  const chunks = hudRenders(hud, timeline, base, 1);
  const whole = hudRenders(hud, timeline, base, 20);
  assert.deepEqual(chunks.map((r) => r.frames), [30, 30, 30]);
  assert.equal(stages.size, 4);
  assert.equal(new Set(chunks.map((r) => r.hash)).size, 3);
  assert.ok(chunks.every((r) => stages.get(r.id) === r));
  assert.equal(chunks[1]!.spec.nodes.find((n) => n.key === "hud:counter")?.kind, "text");
  for (const frame of [0, 29, 30, 45, 59, 60, 89]) {
    const chunk = chunks[Math.floor(frame / 30)]!;
    const local = frame % 30;
    for (const key of ["hud:counter", "hud:timecode"]) {
      assert.equal(textAt(chunk.spec, key, local), textAt(whole[0]!.spec, key, frame), `${key} at ${frame}`);
    }
    for (const key of ["hud:ticker:0", "hud:ticker:1"]) {
      assert.equal(opacityAt(chunk.spec, key, local), opacityAt(whole[0]!.spec, key, frame), `${key} at ${frame}`);
    }
  }
  assert.equal(textAt(chunks[0]!.spec, "hud:counter", 0), "30.0");
  assert.equal(textAt(chunks[2]!.spec, "hud:counter", 29), "99.9");
  assert.equal(textAt(chunks[1]!.spec, "hud:timecode", 0), "00:00:01:00");
  assert.deepEqual(chunks.map((r) => r.spec.events), [[], [], []]);
});

void test("post graph concatenates HUD inputs then overlays only its half-open span", () => {
  const graph = new GraphBuilder();
  const inputs = inputRegistry(1);
  const canvas = graph.add(["0:v"], ["format=rgba"]);
  const renders = [0, 1, 2].map((i) => ({ id: `hud-${i}`, hash: `${i}`, out: `/tmp/hud-${i}.mkv`,
    frames: 30, width: 320, height: 180, spec: { version: 1 as const, width: 320, height: 180, fps: { num: 30, den: 1 },
      frames: 30, nodes: [], tracks: [], events: [] } }));
  const output = placeHud({ graph, inputs, fps: { num: 30, den: 1 } }, canvas, renders, hud);
  assert.equal(inputs.list().length, 3);
  assert.ok(inputs.list().every((input, i) => input.args.join(" ") === `-i /tmp/hud-${i}.mkv`));
  assert.match(graph.toString(), /concat=n=3:v=1:a=0/);
  assert.match(graph.toString(), /setpts=\(N\+0\)\*1\/\(30\*TB\)/);
  assert.match(graph.toString(), /gte\(t,-0\.016667\)\*lt\(t,2\.983333\)/);
  assert.deepEqual(graph.dangling(), [output]);
});
