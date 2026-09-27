import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { packageRoot } from "../../shared/index.ts";
import { StageRenderer, renderStageFrame } from "../render.ts";
import { iconPaths } from "../icons/lucide.ts";
import { SpecBuilder } from "./builder.ts";
import { buildKinetic, kineticStates } from "./kinetic.ts";
import type { KineticConfig } from "./kinetic.ts";
import type { StageSpec } from "../types.ts";

const FPS = 30;
const font = join(packageRoot(), "assets/fonts/Geist-SemiBold.ttf");
const W = 640;
const H = 240;

function config(states: { at: number; text: string; expand?: KineticConfig["states"][number]["expand"] }[], over: Partial<KineticConfig> = {}): KineticConfig {
  const tokens = kineticStates(states);
  return { layout: { fontPath: font, size: 36, letterSpacing: 0, gap: 0.28, lineHeight: 1.18, align: "center", x: W / 2, y: H / 2, iconScale: 1.05 },
    color: "#f5f5f2", letterSpacing: 0, enter: { style: "rise", duration: 0.3, stagger: 0.1, glyphStagger: 0.035, distance: 12, blur: 8 },
    exit: { style: "blur", duration: 0.25 }, move: { stiffness: 170, damping: 22, mass: 1 }, iconStroke: 2,
    icons: (name) => ({ paths: iconPaths(name) ?? [] }), duration: 4, canvas: { width: W, height: H },
    states: states.map((s, i) => ({ at: s.at, tokens: tokens[i]!, expand: s.expand })), ...over };
}

function spec(c: KineticConfig, seconds = 4): StageSpec {
  const b = new SpecBuilder(FPS, 1);
  buildKinetic(b, c);
  return b.spec(W, H, { num: FPS, den: 1 }, seconds * FPS);
}

/** Bounding box of pixels with alpha above a threshold, optionally within an x range. */
function inkBox(f: Uint8Array, minAlpha = 40): { x0: number; x1: number; y0: number; y1: number; count: number } {
  let x0 = W; let x1 = -1; let y0 = H; let y1 = -1; let count = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (f[(y * W + x) * 4 + 3]! > minAlpha) {
    count++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0, x1, y0, y1, count };
}

void test("magic move: survivors re-centre, leavers are gone, motion passes through intermediate positions", () => {
  const s = spec(config([{ at: 0, text: "Anything you can do in a {globe} browser" }, { at: 2, text: "{globe} browser" }]));
  const r = new StageRenderer(s);
  let before = 0;
  const xs: number[] = [];
  for (let n = 0; n < 4 * FPS; n++) {
    const f = r.frame(n);
    if (n === 59) before = inkBox(f).x0;
    if (n >= 60 && n <= 75) xs.push(inkBox(f, 200).x0);
    if (n === 2 * FPS + 24) {
      const box = inkBox(f);
      assert.ok(Math.abs((box.x0 + box.x1) / 2 - W / 2) <= 3, `settled centre ${(box.x0 + box.x1) / 2}`);
      assert.ok(box.x1 - box.x0 < 220, "only the icon and one word remain");
    }
  }
  assert.ok(before < W / 2 - 150, "the full sentence starts far left of centre");
  assert.ok(new Set(xs.map((x) => Math.round(x / 4))).size >= 4, "at least four intermediate positions while moving");
});

void test("camera follow keeps the newest token inside the viewport once settled; fixed mode lets it overflow", () => {
  const text = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen";
  const follow = config([{ at: 0, text }], { camera: { mode: "follow", width: 400, margin: 20 }, layout: { ...config([]).layout, align: "left", x: 140 } });
  const fixed = config([{ at: 0, text }], { camera: { mode: "fixed", width: 400, margin: 20 }, layout: { ...config([]).layout, align: "left", x: 140 } });
  const last = 13 * 0.1 + 0.3 + 0.35;
  const n = Math.round(last * FPS);
  assert.ok(inkBox(renderStageFrame(spec(follow), n)).x1 <= 140 + 200 + 2, "follow keeps the right edge in the viewport");
  assert.ok(inkBox(renderStageFrame(spec(fixed), n)).x1 > W - 5, "fixed overflows the canvas");
});

void test("accent: the first glyph enters in the accent colour and decays to the text colour", () => {
  const c = config([{ at: 0.1, text: "Accent" }], { accent: { color: "#5ac8fa", decay: 0.3 }, enter: { ...config([]).enter, style: "type" } });
  const s = spec(c);
  const colourAt = (n: number) => {
    const f = renderStageFrame(s, n);
    let r = 0; let g = 0; let b = 0; let k = 0;
    for (let i = 0; i < W * H; i++) if (f[i * 4 + 3]! > 200) { r += f[i * 4]!; g += f[i * 4 + 1]!; b += f[i * 4 + 2]!; k++; }
    return [r / k, g / k, b / k];
  };
  const early = colourAt(3);
  const late = colourAt(3 + 12 + 2 + 6);
  assert.ok(early[0]! < 150 && early[2]! > 200, `accent at entry: ${early.map(Math.round).join(",")}`);
  assert.ok(late.every((v) => v > 230), `decayed: ${late.map(Math.round).join(",")}`);
});

void test("type reveals one or two glyphs per frame; scramble resolves to the plain render", () => {
  const typed = spec(config([{ at: 0, text: "Typing" }], { enter: { ...config([]).enter, style: "type", glyphStagger: 0.035 } }));
  const counts = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => inkBox(renderStageFrame(typed, n)).count);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i]! >= counts[i - 1]!, "ink never decreases while typing");
  assert.ok(counts[0]! > 0 && counts[6]! > counts[1]!, "glyphs accumulate");
  const plain = spec(config([{ at: 0, text: "encrypted" }], { enter: { ...config([]).enter, style: "type" } }));
  const scr = spec(config([{ at: 0, text: "encrypted" }], { enter: { ...config([]).enter, style: "scramble" } }));
  assert.ok(Buffer.from(renderStageFrame(scr, 90)).equals(Buffer.from(renderStageFrame(plain, 90))), "resolved scramble equals the fully typed glyphs");
  assert.ok(!Buffer.from(renderStageFrame(scr, 4)).equals(Buffer.from(renderStageFrame(plain, 4))), "early scramble differs");
});

void test("pill width grows monotonically and ends at text width plus padding", () => {
  const c = config([{ at: 0, text: "We killed {globe} {zap}" }], { pill: { fill: "#2c2c2e", strokeWidth: 0, radius: 999, padX: 24, padY: 12 },
    enter: { ...config([]).enter, style: "type" } });
  const s = spec(c);
  const r = new StageRenderer(s);
  let prev = 0;
  let width = 0;
  for (let n = 0; n < 3 * FPS; n++) {
    const box = inkBox(r.frame(n), 250);
    width = box.x1 - box.x0;
    assert.ok(width >= prev - 1, `pill shrank at frame ${n}: ${prev} -> ${width}`);
    prev = width;
  }
  const text = inkBox(renderStageFrame(spec(config([{ at: 0, text: "We killed {globe} {zap}" }], { enter: { ...config([]).enter, style: "none" } })), 60), 100);
  assert.ok(Math.abs(width - (text.x1 - text.x0 + 48)) <= 4, `pill ${width} vs text ${text.x1 - text.x0} + 48`);
});

void test("icons draw strokes; expand grows a plate to fill the frame; paint order keeps pill < tokens < plate", () => {
  const s = spec(config([{ at: 0, text: "Open {globe}" }, { at: 1, text: "{globe}", expand: { token: "icon:globe#0", to: { x: 0, y: 0, width: W, height: H }, radius: 0, fill: "#ff3b30" } }],
    { pill: { fill: "#0000ff", strokeWidth: 0, radius: 999, padX: 20, padY: 10 } }));
  assert.ok(inkBox(renderStageFrame(s, 25), 100).count > 200, "icon and word visible");
  const areas = [32, 36, 40, 48, 60].map((n) => inkBox(renderStageFrame(s, n), 200).count);
  for (let i = 1; i < areas.length; i++) assert.ok(areas[i]! >= areas[i - 1]! - 50, `plate area grows: ${areas.join(",")}`);
  const full = renderStageFrame(s, 90);
  assert.ok(inkBox(full, 250).count >= W * H * 0.99, "plate covers the frame");
  assert.equal(full[(10 * W + 10) * 4], 255, "plate (z 10) above pill (blue, z -1)");
  const nodes = s.nodes.filter((n) => n.key === "kin:pill" || n.key.startsWith("kin:plate"));
  assert.deepEqual(nodes.map((n) => n.z).sort((a, b) => a - b), [-1, 10]);
});

void test("a token that leaves and returns re-enters and then survives a reflow", () => {
  const s = spec(config([{ at: 0, text: "alpha beta" }, { at: 1, text: "alpha" }, { at: 2, text: "beta alpha" }, { at: 3, text: "alpha beta gamma" }]));
  const keys = s.nodes.map((n) => n.key).filter((k) => /^kin:beta#0(@\d)?$/.test(k));
  assert.deepEqual(keys, ["kin:beta#0", "kin:beta#0@2"]);
  const returned = s.tracks.filter((t) => t.node === "kin:beta#0@2" && t.prop === "x");
  assert.ok(returned.some((t) => t.keys.some((k) => k.ease === "spring")), "the returned beta springs to its state-3 position");
});

void test("kinetic layouts are deterministic", () => {
  const c = config([{ at: 0, text: "Same {star} every time" }, { at: 1.5, text: "{star} time" }]);
  assert.ok(Buffer.from(renderStageFrame(spec(c), 50)).equals(Buffer.from(renderStageFrame(spec(c), 50))));
});
