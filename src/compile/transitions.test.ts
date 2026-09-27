import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { encodePng } from "./png.ts";
import { planFromTimeline } from "../cli/commands/plan-shared.ts";
import { locateTools } from "../probe/index.ts";
import { renderPlan } from "../render/runner.ts";
import { preview } from "../qa/preview.ts";
import { runChecked } from "../shared/index.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";

const W = 480;
const H = 270;
const QUAD: Record<string, [number, number, number]> = { tl: [230, 30, 30], tr: [30, 200, 30], bl: [30, 30, 230], br: [240, 240, 240] };

function quadrants(path: string): void {
  const px = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const q = (y < H / 2 ? "t" : "b") + (x < W / 2 ? "l" : "r");
    px.set([...QUAD[q]!, 255], (y * W + x) * 4);
  }
  writeFileSync(path, encodePng(W, H, 4, px));
}

async function rgb(path: string, frame: number): Promise<Buffer> {
  const out = await runChecked(locateTools().ffmpeg, ["-v", "error", "-i", path, "-vf", `select=eq(n\\,${frame}),format=rgb24`, "-frames:v", "1",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  return out.stdout;
}
const at = (f: Buffer, x: number, y: number) => [f[(y * W + x) * 3]!, f[(y * W + x) * 3 + 1]!, f[(y * W + x) * 3 + 2]!];
const near = (a: number[], b: number[], tol = 28) => a.every((v, i) => Math.abs(v - b[i]!) <= tol);

async function withDir<T>(body: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "vid2-tr-"));
  const before = process.env["VID2_HOME"];
  process.env["VID2_HOME"] = join(dir, "home");
  try { return await body(dir); } finally { if (before === undefined) delete process.env["VID2_HOME"]; else process.env["VID2_HOME"] = before; }
}

void test("zoomfrom rescales the next scene into a growing off-centre rect; iris opens from a point; preview matches", async (t) => {
  if (!requireFfmpeg(t)) return;
  await withDir(async (dir) => {
    quadrants(join(dir, "q.png"));
    const path = join(dir, "t.json");
    // 040 acceptance geometry at 1/4 scale: rect (200,150,200,120) on 1920x1080 → (50,37.5,50,30) on 480x270.
    writeFileSync(path, JSON.stringify({ version: 1, output: { width: W, height: H, fps: 10 }, sources: { q: { type: "image", path: "q.png" } },
      scenes: [
        { id: "a", duration: "2s", background: "#000000", transition: { type: "zoomfrom", duration: "1s", rect: { x: 50, y: 37.5, width: 50, height: 30, radius: 0 } } },
        { id: "b", duration: "2s", layers: [{ type: "media", source: "q" }], transition: { type: "iris", duration: "1s", center: { x: 50, y: 50 } } },
        { id: "c", duration: "2s", background: "#ffff00" }] }));
    const { plan } = await planFromTimeline(path, dir, "final");
    const out = join(dir, "z.mp4");
    await renderPlan(plan, { out });
    const mid = await rgb(out, 15);
    assert.ok(near(at(mid, 225, 75), QUAD["tr"]!), `rescaled sample is B top-right: ${at(mid, 225, 75).join(",")}`);
    assert.ok(!near(at(mid, 225, 75), QUAD["tl"]!), "a mask-only reveal would show top-left here");
    assert.ok(at(mid, 375, 225).every((v) => v < 25), `outside the rect is A: ${at(mid, 375, 225).join(",")}`);
    const iris = await rgb(out, 25);
    assert.ok(iris[(55 * W + 55) * 3]! > 200 && iris[(55 * W + 55) * 3 + 2]! < 60, "iris centre shows the yellow scene");
    assert.ok(near(at(iris, 430, 250), QUAD["br"]!), "iris far corner still shows scene b");
    const [still] = await preview(plan, [15], { out: join(dir, "stills") });
    const png = await runChecked(locateTools().ffmpeg, ["-v", "error", "-i", still!.path, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
    let diff = 0;
    for (let i = 0; i < mid.length; i++) diff += Math.abs(mid[i]! - png.stdout[i]!);
    assert.ok(diff / mid.length <= 2, `preview inside zoomfrom differs by ${diff / mid.length}`);
    const proxy = await planFromTimeline(path, dir, "proxy");
    assert.deepEqual(proxy.plan.join.steps[0]!.spec!.rect, { x: 25, y: 18.75, width: 25, height: 15, radius: 0 });
  });
});
