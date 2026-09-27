import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { GraphBuilder } from "../../graph.ts";
import type { BuildContext, LayerOf } from "../../ir.ts";
import { TimelineSchema, resolveTimeline } from "../../../timeline/index.ts";
import { tempDir } from "../../../../tests/helpers.ts";
import { layoutText } from "./glyphs.ts";
import { renderTextImage } from "./image.ts";
import { rasterizePaths } from "./rasterize.ts";

function context(): BuildContext {
  const workDir = tempDir("vid2-raster-unit-");
  return { graph: new GraphBuilder(), inputs: { add: () => "0:v", list: () => [] }, width: 320, height: 180, scale: 1,
    fps: { num: 15, den: 1 }, rate: 1, frames: 30, renderFrames: 30, background: "#000000", oversample: 1,
    profile: "final", sceneId: "one", sources: {}, fonts: {}, workDir, pngDir: join(workDir, "png"), textBackend: "raster" };
}

function layer(extra: Record<string, unknown> = {}): LayerOf<"text"> {
  const t = TimelineSchema.parse({ version: 1, output: { width: 320, height: 180, fps: 15 }, scenes: [{ id: "one", duration: "2s",
    layers: [{ type: "text", text: "AV AV", size: 40, animation: "none", ...extra }] }] });
  return resolveTimeline(t, { baseDir: process.cwd() }).scenes[0]!.layers[0] as LayerOf<"text">;
}

test("layout applies kerning, wrapping, and explicit newlines", () => {
  const ctx = context();
  const wide = layoutText(layer(), ctx);
  const wrapped = layoutText(layer({ maxWidth: 65 }), ctx);
  const longWord = layoutText(layer({ text: "SUPERCALIFRAGILISTIC", maxWidth: 65 }), ctx);
  const newline = layoutText(layer({ text: "AV\nAV" }), ctx);
  assert.ok(wide.width > wrapped.width);
  assert.ok(wrapped.lines.length > 1);
  assert.ok(longWord.lines.length > 1);
  assert.ok(longWord.width <= 65);
  assert.deepEqual(newline.lines, ["AV", "AV"]);
  assert.ok(newline.widths[0]! < 2 * layoutText(layer({ text: "A" }), ctx).width);
});

test("non-zero winding rasterizer fills ink and antialiases edges", () => {
  const alpha = rasterizePaths([{ commands: [{ type: "M", x: 1.2, y: 1.2 }, { type: "L", x: 8.8, y: 1.2 },
    { type: "L", x: 8.8, y: 8.8 }, { type: "L", x: 1.2, y: 8.8 }, { type: "Z" }] }], 10, 10);
  assert.ok(alpha.filter(value => value > 200).length >= 36);
  assert.equal(alpha[5 * 10 + 5], 255);
  assert.ok(alpha.some(value => value > 0 && value < 255));
  assert.equal(alpha[0], 0);
  const hole = rasterizePaths([{ commands: [
    { type: "M", x: 1, y: 1 }, { type: "L", x: 9, y: 1 }, { type: "L", x: 9, y: 9 }, { type: "L", x: 1, y: 9 }, { type: "Z" },
    { type: "M", x: 3, y: 3 }, { type: "L", x: 3, y: 7 }, { type: "L", x: 7, y: 7 }, { type: "L", x: 7, y: 3 }, { type: "Z" },
  ] }], 10, 10);
  assert.equal(hole[5 * 10 + 5], 0);
});

test("glyph image contains colored alpha pixels, box, and shadow", () => {
  const image = renderTextImage(layer({ text: "VID2", box: { color: "#112233", padding: 10 },
    shadow: { color: "#00000099", blur: 4, y: 3 } }), context());
  assert.ok(image.width > 70 && image.height > 35);
  assert.ok(image.data.filter((_, i) => i % 4 === 3 && image.data[i]! > 0).length > 100);
  assert.equal(image.png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
});
