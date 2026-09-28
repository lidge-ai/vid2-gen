import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { packageRoot } from "../shared/index.ts";
import { evaluateTextNode } from "./scene.ts";
import type { TextNode } from "./types.ts";

const font = join(packageRoot(), "assets/fonts/GeistMono-Regular.ttf");
const base: TextNode = { kind: "text", key: "hud:counter", text: "", font, size: 28, color: "#FFFFFF", letterSpacing: 0,
  x: 0, y: 0, anchorX: 0, anchorY: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blur: 0, z: 0 };
const displayed = (node: TextNode, frame: number): string => (evaluateTextNode(node, frame) as TextNode).text;

void test("keyed HUD counter is exact at first, middle and last output frames", () => {
  const node: TextNode = { ...base, keyed: { keys: [{ frame: 0, value: 30 }, { frame: 89, value: 99.9 }], mode: "linear",
    decimals: 1, pad: 0, prefix: "", suffix: "" } };
  assert.equal(displayed(node, 0), "30.0");
  assert.equal(displayed(node, 45), (30 + (99.9 - 30) * 45 / 89).toFixed(1));
  assert.equal(displayed(node, 89), "99.9");
});

void test("hold keeps the previous key; signed values pad only the integer digits", () => {
  const node: TextNode = { ...base, keyed: { keys: [{ frame: 10, value: -3.5 }, { frame: 60, value: 7 }], mode: "hold",
    decimals: 1, pad: 3, prefix: "[", suffix: "]" } };
  assert.equal(displayed(node, 0), "[-003.5]");
  assert.equal(displayed(node, 59), "[-003.5]");
  assert.equal(displayed(node, 60), "[007.0]");
  assert.equal(displayed(node, 89), "[007.0]");
});

void test("elapsed timecode continues from HUD origin across a chunk; frames mode uses absolute frame", () => {
  const elapsed: TextNode = { ...base, timecode: { mode: "elapsed", base: 60, origin: 15, fps: { num: 30, den: 1 }, prefix: "TC " } };
  assert.equal(displayed(elapsed, 0), "TC 00:00:01:15");
  assert.equal(displayed(elapsed, 29), "TC 00:00:02:14");
  const frames: TextNode = { ...base, timecode: { ...elapsed.timecode!, mode: "frames", prefix: "F " } };
  assert.equal(displayed(frames, 29), "F 89");
});

void test("dynamic text precedence is counter, keyed, timecode, then scramble", () => {
  const node: TextNode = { ...base, counter: { from: 1, to: 9, start: 0, end: 89, decimals: 0, prefix: "", suffix: "" },
    keyed: { keys: [{ frame: 0, value: 30 }], mode: "hold", decimals: 0, pad: 0, prefix: "", suffix: "" },
    timecode: { mode: "frames", base: 10, origin: 0, fps: { num: 30, den: 1 }, prefix: "" },
    scramble: { chars: "X", from: 0, until: 2, step: 1 } };
  assert.equal(displayed(node, 0), "X");
  assert.equal(displayed(node, 2), "12");
  const keyed: TextNode = { ...node, timecode: undefined, scramble: undefined };
  assert.equal(displayed(keyed, 2), "30");
});
