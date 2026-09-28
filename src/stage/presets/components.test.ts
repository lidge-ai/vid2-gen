import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { packageRoot } from "../../shared/index.ts";
import { measureText } from "../raster.ts";
import { StageRenderer, renderStageFrame } from "../render.ts";
import { frameItems } from "../scene.ts";
import { SpriteCache } from "../sprites.ts";
import { indexTracks, nodeAt } from "../tracks.ts";
import { iconPaths } from "../icons/lucide.ts";
import { SpecBuilder } from "./builder.ts";
import { buildBars } from "./bars.ts";
import { onFill } from "./bars.ts";
import { settledTextBoxes } from "../settle.ts";
import { buildChips } from "./chips.ts";
import { buildField } from "./field.ts";
import type { FieldConfig } from "./field.ts";
import { componentStyle } from "./style.ts";
import { buildTicker } from "./ticker.ts";
import type { StageSpec } from "../types.ts";

const FPS = 30;
const W = 800;
const H = 400;
const font = join(packageRoot(), "assets/fonts/Geist-Regular.ttf");
const dark = componentStyle("dark");
const move = { stiffness: 170, damping: 22, mass: 1 };

function spec(build: (b: SpecBuilder) => void, seconds = 4): StageSpec {
  const b = new SpecBuilder(FPS, 1);
  build(b);
  return b.spec(W, H, { num: FPS, den: 1 }, seconds * FPS);
}
const node = (s: StageSpec, key: string, frame: number) => nodeAt(s.nodes.find((n) => n.key === key)!, indexTracks(s.tracks), frame, s.fps);
const visible = (s: StageSpec, frame: number, prefix: string) => frameItems(s, indexTracks(s.tracks), frame, new SpriteCache())
  .filter((i) => i.key.startsWith(prefix) && i.opacity > 0.5).length;

function field(over: Partial<FieldConfig> = {}): FieldConfig {
  return { x: 400, y: 200, width: 300, height: 64, radius: 999, size: 28, fontPath: font, typing: [{ at: 0.5, text: "hello world", glyph: 0.05 }],
    caret: true, style: dark, duration: 4, move, ...over };
}

void test("field: glyphs follow typing timing, caret tracks the advance, mask swaps to bullets, click emits an event", () => {
  const s = spec((b) => buildField(b, field({ mask: { at: 2, char: "•" }, cursor: { style: "ibeam", from: { x: 700, y: 350 }, at: 0.3, click: 0.35 } })));
  const times = [...Array(11).keys()].map((i) => Math.round((0.5 + i * 0.05) * FPS));
  for (const f of [15, 17, 19, 21, 25]) assert.equal(visible(s, f, "fld:g"), times.filter((t) => t <= f).length, `glyphs at frame ${f}`);
  const advance = measureText(font, "hello world", 28, 0).advances[11]!;
  assert.ok(Math.abs((node(s, "fld:caret", 60).x) - (advance + 2)) <= 2, "caret after the last glyph");
  assert.equal(visible(s, 70, "fld:g"), 0, "glyphs hidden after mask");
  assert.equal(visible(s, 70, "fld:m"), 11, "one bullet per glyph");
  assert.ok(s.events.some((e) => e.kind === "click" && e.frame === Math.round(0.35 * FPS)));
});

void test("field grow widens monotonically to text + 2 padX, and accent tints the newest glyph", () => {
  const long = "a cat astronaut, 35mm film, golden hour";
  const s = spec((b) => buildField(b, field({ grow: { maxWidth: 780, padX: 30 }, typing: [{ at: 0.2, text: long, glyph: 0.03 }],
    accent: { color: "#5ac8fa", decay: 0.3 } })));
  let prev = 0;
  for (let f = 0; f < 90; f++) {
    const pill = node(s, "fld:pill", f);
    const w = pill.kind === "rect" ? pill.width : 0;
    assert.ok(w >= prev - 0.5, `shrank at ${f}`);
    prev = w;
  }
  const expected = Math.min(780, measureText(font, long, 28, 0).width + 60 + 28 * 0.6);
  assert.ok(Math.abs(prev - expected) <= 2, `final width ${prev} vs ${expected}`);
  const g0 = node(s, "fld:g0", Math.round(0.2 * FPS));
  assert.equal(g0.kind === "text" && g0.color.slice(0, 7).toLowerCase(), "#5ac8fa");
});

void test("bars: highlighted bar reaches value/max × width, numbers count up, bars start in stagger order", () => {
  const s = spec((b) => buildBars(b, { x: 100, y: 100, width: 500, rowHeight: 40, gap: 12, max: 100, unit: "%", decimals: 0, start: 0.2, grow: 0.8,
    stagger: 0.15, countUp: true, size: 20, fontPath: font, style: dark, barColor: "#3a3a3c",
    items: [{ label: "Ours", value: 99, highlight: true }, { label: "Theirs", value: 70 }] }));
  const bar = node(s, "bar:0", Math.round(1.1 * FPS));
  assert.ok(bar.kind === "rect" && Math.abs(bar.width - 495) <= 2, "99% of 500");
  const f = renderStageFrame(s, Math.round(0.6 * FPS));
  assert.ok(f.some((v, i) => i % 4 === 3 && v > 0));
  const w1early = node(s, "bar:1", Math.round(0.3 * FPS));
  assert.ok(w1early.kind === "rect" && w1early.width === 0, "second bar has not started at 0.3 s");
  assert.ok(s.events.some((e) => e.kind === "grow"));
});

void test("text on a highlighted bar picks ink on light accents and white on dark ones", () => {
  assert.equal(onFill("#5AC8FA").text, "#0B0B0F");
  assert.equal(onFill("#1C3A8A").text, "#FFFFFF");
});

void test("QA text boxes wait until colour animation (reading highlight) finishes", () => {
  const s = spec((b) => {
    b.add({ key: "t", kind: "text", text: "read me", font, size: 40, color: "#1C1C1E", letterSpacing: 0, x: 400, y: 200, anchorX: 0.5, anchorY: 0.5,
      scale: 1, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blur: 0, z: 0 });
    b.key("t", "color", [{ t: 0, v: "#C7C7CC" }, { t: 1.5, v: "#C7C7CC" }, { t: 1.64, v: "#1C1C1E", ease: "linear" }]);
  });
  const [box] = settledTextBoxes(s);
  assert.ok(box && box.frame >= Math.round(1.64 * FPS) && box.color.slice(0, 7).toLowerCase() === "#1c1c1e", JSON.stringify(box));
});

void test("ticker: the active row at step k is item k; rows above fade out", () => {
  const items = ["sign in", "messaging", "payments", "documents"].map((text) => ({ text }));
  const s = spec((b) => buildTicker(b, { x: 100, y: 200, prefix: "can do", items, start: 0, interval: 0.5, visible: 4, size: 40, fontPath: font, style: dark, move }));
  for (let k = 0; k < items.length; k++) {
    const f = Math.round((k * 0.5 + 0.45) * FPS);
    const active = node(s, `tick:${k}`, f);
    assert.ok(Math.abs(active.y - 200) <= 2, `item ${k} on the baseline at step ${k}`);
    assert.ok(active.opacity > 0.95);
    if (k > 0) assert.ok(node(s, `tick:${k - 1}`, f).opacity < 0.05, "the previous item has left");
  }
  assert.equal(s.events.filter((e) => e.kind === "tick").length, items.length - 1);
});

void test("chips: connector draws before each chip, chips appear at their time", () => {
  const s = spec((b) => buildChips(b, { x: 400, y: 80, direction: "column", gap: 16, size: 22, fontPath: font, style: dark,
    connector: { from: { x: 150, y: 200 }, dot: true },
    items: [{ at: 0.5, text: "Spawned", icon: { paths: iconPaths("sparkles")! }, note: "one" }, { at: 1, text: "Spawned", note: "two" }] }));
  assert.ok(node(s, "chip:1:line", Math.round(0.8 * FPS)).kind === "path");
  const line = node(s, "chip:1:line", Math.round(0.825 * FPS));
  assert.ok(line.kind === "path" && line.progress > 0.2 && line.progress < 0.8, "connector half drawn mid-way");
  assert.ok(node(s, "chip:0", Math.round(0.45 * FPS)).opacity < 0.05 && node(s, "chip:0", Math.round(0.9 * FPS)).opacity > 0.95);
  const r = new StageRenderer(s);
  for (let n = 0; n < 45; n++) r.frame(n);
});
