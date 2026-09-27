#!/usr/bin/env node
// Stage renderer throughput (010 acceptance 8): 1080p, 90 frames, 30 word tokens + 5 rects, frames rendered in JS only (no encode).
import { join } from "node:path";
import { StageRenderer } from "../src/stage/render.ts";
import { packageRoot } from "../src/shared/index.ts";

const font = join(packageRoot(), "assets/fonts/Geist-SemiBold.ttf");
const base = { anchorX: 0, anchorY: 0.5, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, blur: 0, z: 0 };
const words = "vid2 turns an agent into an editor that types moves and cuts to the beat with ffmpeg underneath and a stage on top so every word lands".split(" ").slice(0, 30);
const nodes = [];
const tracks = [];
words.forEach((text, i) => {
  const key = `w${i}`;
  const x = 120 + (i % 6) * 290;
  const y = 180 + Math.floor(i / 6) * 150;
  nodes.push({ key, kind: "text", text, font, size: 72, color: "#f5f5f2", letterSpacing: 0, x, y, ...base });
  const at = i * 2;
  tracks.push({ node: key, prop: "opacity", keys: [{ frame: at, value: 0 }, { frame: at + 10, value: 1, ease: "out" }] });
  tracks.push({ node: key, prop: "y", keys: [{ frame: at, value: y + 14 }, { frame: at + 12, value: y, ease: "out" }] });
  tracks.push({ node: key, prop: "blur", keys: [{ frame: at, value: 10 }, { frame: at + 10, value: 0, ease: "out" }] });
  tracks.push({ node: key, prop: "color", keys: [{ frame: at, value: "#5ac8fa" }, { frame: at + 9, value: "#f5f5f2", ease: "linear" }] });
});
for (let i = 0; i < 5; i++) {
  const key = `r${i}`;
  nodes.push({ key, kind: "rect", width: 300, height: 90, radius: 45, fill: "#1c1c1ecc", stroke: "#ffffff22", strokeWidth: 2,
    glow: { color: "#5ac8fa33", blur: 16 }, x: 200 + i * 320, y: 960, ...base, z: -1 });
  tracks.push({ node: key, prop: "width", keys: [{ frame: 0, value: 120 }, { frame: 40 + i * 6, value: 300, ease: "spring" }] });
}
const spec = { version: 1, width: 1920, height: 1080, fps: { num: 30, den: 1 }, frames: 90, nodes, tracks, events: [] };
const renderer = new StageRenderer(spec);
const started = performance.now();
for (let n = 0; n < spec.frames; n++) renderer.frame(n);
const seconds = (performance.now() - started) / 1000;
console.log(JSON.stringify({ frames: spec.frames, seconds: Number(seconds.toFixed(2)), fps: Number((spec.frames / seconds).toFixed(1)) }));
