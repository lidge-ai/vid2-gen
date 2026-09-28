import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { packageRoot } from "../../shared/index.ts";
import { HudOverlay } from "../../timeline/film.ts";
import type { ResolvedHud } from "../../timeline/film.ts";
import { evaluateTextNode } from "../scene.ts";
import { indexTracks, nodeAt } from "../tracks.ts";
import type { StageSpec, TextNode } from "../types.ts";
import { buildHudSpec } from "./hud.ts";

const font = join(packageRoot(), "assets/fonts/GeistMono-Regular.ttf");
const hud: ResolvedHud = { ...HudOverlay.parse({ type: "hud", label: "REC", counter: { keys: [{ at: "0s", value: 30 },
  { at: "89f", value: 99.9 }], decimals: 1 }, timecode: { mode: "elapsed" },
  ticker: { items: [{ at: "0s", text: "first" }, { at: "45f", text: "second" }] } }),
  startFrame: 0, endFrame: 90, startSeconds: 0, endSeconds: 3, absoluteStartFrame: 0, absoluteEndFrame: 90,
  absoluteStartSeconds: 0, absoluteEndSeconds: 3,
  counterKeys: [{ frame: 0, value: 30 }, { frame: 89, value: 99.9 }],
  tickerItems: [{ frame: 0, text: "first" }, { frame: 45, text: "second" }] };

function node(spec: StageSpec, key: string, frame: number): TextNode {
  const found = spec.nodes.find((n) => n.key === key);
  assert.ok(found?.kind === "text");
  return evaluateTextNode(nodeAt(found, indexTracks(spec.tracks), frame, spec.fps), frame) as TextNode;
}

void test("HUD spec uses fixed brackets and text positions with no stage events", () => {
  const spec = buildHudSpec(hud, { width: 320, height: 180, scale: 1, fps: { num: 30, den: 1 }, frames: 90, fontPath: font,
    base: 0, counterKeys: hud.counterKeys, tickerItems: hud.tickerItems });
  assert.equal(spec.events.length, 0);
  assert.equal(spec.nodes.filter((n) => n.key.startsWith("hud:top:") || n.key.startsWith("hud:bottom:")).length, 8);
  const strip = spec.nodes.find((n) => n.key === "hud:ticker:strip");
  assert.ok(strip?.kind === "rect");
  assert.equal(strip.width, 320);
  assert.equal(strip.height, 44);
  assert.equal(node(spec, "hud:label", 0).text, "REC");
  const counter = node(spec, "hud:counter", 0);
  assert.equal(counter.anchorX, 1);
  assert.equal(counter.font, font);
  assert.equal(counter.text, "30.0");
  assert.equal(node(spec, "hud:counter", 89).text, "99.9");
  assert.equal(node(spec, "hud:timecode", 89).text, "00:00:02:29");
});

void test("ticker switches at the authored frame with no scrolling or event", () => {
  const spec = buildHudSpec(hud, { width: 320, height: 180, scale: 1, fps: { num: 30, den: 1 }, frames: 90, fontPath: font,
    base: 0, counterKeys: hud.counterKeys, tickerItems: hud.tickerItems });
  assert.equal(node(spec, "hud:ticker:0", 44).opacity, 1);
  assert.equal(node(spec, "hud:ticker:1", 44).opacity, 0);
  assert.equal(node(spec, "hud:ticker:0", 45).opacity, 0);
  assert.equal(node(spec, "hud:ticker:1", 45).opacity, 1);
  assert.equal(spec.events.length, 0);
});
