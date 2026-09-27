import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { encodePng, solidRect } from "../compile/png.ts";
import { planFromTimeline } from "../cli/commands/plan-shared.ts";
import { locateTools } from "../probe/index.ts";
import { renderPlan } from "../render/runner.ts";
import { runChecked } from "../shared/index.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";
import { preview } from "./preview.ts";

async function rgb(ffmpeg: string, path: string, frame?: number): Promise<Buffer> {
  const filter = frame === undefined ? "format=rgb24" : `select=eq(n\\,${frame}),format=rgb24`;
  const result = await runChecked(ffmpeg, ["-v", "error", "-i", path, "-vf", filter,
    "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  return result.stdout;
}
function meanDifference(a: Buffer, b: Buffer): number {
  assert.equal(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}

void test("preview matches full proxy at fade, flash, second sweep seam and third-scene rgb split", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ffmpeg } = locateTools();
  const dir = mkdtempSync(join(tmpdir(), "vid2-preview-"));
  const before = process.env.VID2_HOME; process.env.VID2_HOME = join(dir, "home");
  try {
    const bands = join(dir, "bands.png");
    const pixels = new Uint8Array(320 * 180 * 4);
    for (let y = 0; y < 180; y++) for (let x = 0; x < 320; x++) {
      const i = (y * 320 + x) * 4;
      pixels.set(x < 160 ? [230, 40, 40, 255] : [40, 80, 230, 255], i);
    }
    writeFileSync(bands, encodePng(320, 180, 4, pixels));
    const stripe = join(dir, "stripe.png");
    writeFileSync(stripe, solidRect(80, 180, 0, [255, 255, 255, 255]));
    const timeline = join(dir, "timeline.json");
    writeFileSync(timeline, JSON.stringify({ version: 1, output: { width: 320, height: 180, fps: 15 },
      sources: { bands: { type: "image", path: bands }, stripe: { type: "image", path: stripe } },
      scenes: [
        { id: "red", duration: "2s", background: "#ff0000", transition: { type: "fade", duration: "0.5s" } },
        { id: "green", duration: "2s", background: "#00ff00", transition: { type: "fade", duration: "0.5s" } },
        { id: "motion", duration: "2s", layers: [{ type: "media", source: "bands" }] },
      ], overlays: [{ type: "overlay", source: "stripe", blend: "screen", opacity: 0.15,
        motion: "sweep", start: "0s", end: "4.9s" }],
      effects: [{ type: "flash", at: "1s", strength: 0.25, decay: 12 },
        { type: "rgbsplit", at: "4.2s", frames: 3, px: 10 }],
    }));
    const { plan } = await planFromTimeline(timeline, dir, "proxy");
    const full = join(dir, "full.mp4");
    await renderPlan(plan, { out: full, jobs: 2 });
    const frames = [26, 15, 48, 63];
    const stills = await preview(plan, frames, { out: join(dir, "stills") });
    assert.equal(stills.length, 4);
    const differences: number[] = [];
    for (let i = 0; i < frames.length; i++) {
      assert.equal(stills[i]?.composition, "final");
      assert.ok(existsSync(stills[i]!.path));
      const difference = meanDifference(await rgb(ffmpeg, full, frames[i]), await rgb(ffmpeg, stills[i]!.path));
      differences.push(difference);
      t.diagnostic(`frame ${frames[i]} difference ${difference.toFixed(3)}`);
    }
    assert.ok(differences.every((difference) => difference < 2), `preview differences: ${differences.join(", ")}`);
    assert.deepEqual(stills[2]?.scenes, ["green", "motion"]);
    assert.equal(stills[2]?.window.startFrame, 22);
    assert.equal(stills[3]?.window.startFrame, 44);
    const segment = await preview(plan, [15], { out: join(dir, "segment"), segmentOnly: true });
    const segmentFrame = segment[0];
    assert.ok(segmentFrame);
    assert.equal(segmentFrame.composition, "segment");
    assert.ok(meanDifference(await rgb(ffmpeg, full, 15), await rgb(ffmpeg, segmentFrame.path)) > 2);
    const seamSegment = await preview(plan, [26], { out: join(dir, "seam-segment"), segmentOnly: true });
    assert.deepEqual(seamSegment[0]?.scenes, ["red"]);
    const manifest = JSON.parse(readFileSync(join(dir, "stills", "preview.json"), "utf8")) as { frames: unknown[] };
    assert.equal(manifest.frames.length, 4);
  } finally {
    if (before === undefined) delete process.env.VID2_HOME; else process.env.VID2_HOME = before;
    rmSync(dir, { recursive: true, force: true });
  }
});
