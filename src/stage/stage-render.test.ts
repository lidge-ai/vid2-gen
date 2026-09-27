import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { encodePng } from "../compile/png.ts";
import { compileTimeline } from "../compile/plan.ts";
import { loadPlanOrTimeline, planFromTimeline } from "../cli/commands/plan-shared.ts";
import { locateTools, probeFfmpeg } from "../probe/index.ts";
import { renderPlan, renderSegments } from "../render/runner.ts";
import type { RenderEvent } from "../render/runner.ts";
import { stageCacheKey } from "../render/stages.ts";
import { packageRoot, runChecked, sha256 } from "../shared/index.ts";
import { resolveTimeline, TimelineSchema, validateTimeline } from "../timeline/index.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";
import { preview } from "../qa/preview.ts";

async function rgbFrame(path: string, frame: number): Promise<Buffer> {
  const { ffmpeg } = locateTools();
  const out = await runChecked(ffmpeg, ["-v", "error", "-i", path, "-vf", `select=eq(n\\,${frame}),format=rgb24`, "-frames:v", "1",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  return out.stdout;
}
const px = (f: Buffer, x: number, y: number) => [f[(y * 160 + x) * 3]!, f[(y * 160 + x) * 3 + 1]!, f[(y * 160 + x) * 3 + 2]!];

function timelineJson(dir: string): string {
  const path = join(dir, "t.json");
  writeFileSync(path, JSON.stringify({ version: 1, output: { width: 160, height: 90, fps: 10 },
    scenes: [
      { id: "move", duration: "2s", background: "#ff0000", layers: [{ type: "stage",
        nodes: [{ kind: "rect", key: "box", x: 20, y: 45, width: 20, height: 20, fill: "#ffffff" }],
        tracks: [{ node: "box", prop: "x", keys: [{ at: 0, value: 20 }, { at: "1s", value: 140, ease: "linear" }] }] }] },
      { id: "alpha", duration: "1s", background: "#000000", layers: [{ type: "stage",
        nodes: [{ kind: "rect", key: "half", x: 80, y: 45, width: 60, height: 40, fill: "#ffffff", opacity: 0.5 }] }] },
    ] }));
  return path;
}

async function withHome<T>(dir: string, body: () => Promise<T>): Promise<T> {
  const before = process.env["VID2_HOME"];
  process.env["VID2_HOME"] = join(dir, "home");
  try { return await body(); } finally { if (before === undefined) delete process.env["VID2_HOME"]; else process.env["VID2_HOME"] = before; }
}

void test("stage rect moves at the analytic position, alpha survives, second render hits the stage cache", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = mkdtempSync(join(tmpdir(), "vid2-stage-"));
  await withHome(dir, async () => {
    const { plan } = await planFromTimeline(timelineJson(dir), dir, "final");
    assert.equal(plan.stageRenders.length, 2);
    assert.deepEqual(plan.segments.map((s) => s.stageDeps.length), [1, 1]);
    const out = join(dir, "a.mp4");
    await renderPlan(plan, { out });
    const mid = await rgbFrame(out, 5);
    assert.ok(px(mid, 80, 45).every((v) => v > 225), `box centre at frame 5: ${px(mid, 80, 45).join(",")}`);
    assert.ok(px(mid, 120, 45)[0]! > 200 && px(mid, 120, 45)[1]! < 40, "red outside the box");
    const half = await rgbFrame(out, 22);
    assert.ok(px(half, 80, 45).every((v) => Math.abs(v - 128) <= 8), `half alpha: ${px(half, 80, 45).join(",")}`);
    const events: RenderEvent[] = [];
    await renderPlan(plan, { out: join(dir, "b.mp4"), logger: (e) => events.push(e) });
    assert.equal(events.filter((e) => e.stage === "stage" && e.message === "cached").length, 2);
    const planPath = join(dir, "t.plan.json");
    writeFileSync(planPath, JSON.stringify(plan));
    const replay = await loadPlanOrTimeline("t.plan.json", dir, "final");
    await renderPlan(replay.plan, { out: join(dir, "c.mp4"), noCache: true });
    assert.equal(sha256(await rgbFrame(join(dir, "c.mp4"), 5)), sha256(mid));
    const [still] = await preview(plan, [5], { out: join(dir, "stills") });
    const stillRgb = await runChecked(locateTools().ffmpeg, ["-v", "error", "-i", still!.path, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
    let diff = 0;
    for (let i = 0; i < mid.length; i++) diff += Math.abs(mid[i]! - stillRgb.stdout[i]!);
    assert.ok(diff / mid.length <= 2, `preview differs from render by ${diff / mid.length}`);
  });
});

void test("a 0.1 plan without stage fields still renders", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = mkdtempSync(join(tmpdir(), "vid2-stage-old-"));
  await withHome(dir, async () => {
    const path = join(dir, "t.json");
    writeFileSync(path, JSON.stringify({ version: 1, output: { width: 160, height: 90, fps: 10 }, scenes: [{ id: "a", duration: "1s", background: "#0000ff" }] }));
    const { plan } = await planFromTimeline(path, dir, "proxy");
    const legacy = JSON.parse(JSON.stringify(plan)) as Record<string, unknown> & { segments: Record<string, unknown>[] };
    delete legacy["stageRenders"];
    for (const s of legacy.segments) delete s["stageDeps"];
    writeFileSync(join(dir, "old.plan.json"), JSON.stringify(legacy));
    const loaded = await loadPlanOrTimeline("old.plan.json", dir, "proxy");
    assert.deepEqual(loaded.plan.stageRenders, []);
    await renderPlan(loaded.plan, { out: join(dir, "old.mp4") });
  });
});

void test("stage cache key follows image and font content, not paths or mtimes", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = mkdtempSync(join(tmpdir(), "vid2-stage-key-"));
  await withHome(dir, async () => {
    const image = join(dir, "i.png");
    writeFileSync(image, encodePng(2, 2, 4, new Uint8Array(16).fill(200)));
    const font = join(dir, "custom.ttf");
    copyFileSync(join(packageRoot(), "assets/fonts/Geist-Regular.ttf"), font);
    const path = join(dir, "t.json");
    writeFileSync(path, JSON.stringify({ version: 1, output: { width: 160, height: 90, fps: 10 }, fonts: { custom: { path: font } },
      sources: { pic: { type: "image", path: image } }, scenes: [{ id: "a", duration: "1s", layers: [{ type: "stage", nodes: [
        { kind: "image", key: "pic", source: "pic", width: 20, height: 20 }, { kind: "text", key: "t", text: "Hi", font: "custom" }] }] }] }));
    const key = async () => { const { plan } = await planFromTimeline(path, dir, "proxy"); return stageCacheKey(plan.stageRenders[0]!, plan.tool.version); };
    const first = await key();
    const mtime = statSync(image).mtime;
    writeFileSync(image, encodePng(2, 2, 4, new Uint8Array(16).fill(90)));
    utimesSync(image, mtime, mtime);
    const second = await key();
    assert.notEqual(first, second, "image content change");
    copyFileSync(join(packageRoot(), "assets/fonts/Geist-Bold.ttf"), font);
    assert.notEqual(await key(), second, "font content change");
  });
});

void test("one image source at two fits keeps both decodes; spare tail frames hold the stage before a transition", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = mkdtempSync(join(tmpdir(), "vid2-stage-img-"));
  await withHome(dir, async () => {
    const pixels = new Uint8Array(20 * 20 * 4);
    for (let i = 0; i < 400; i++) pixels.set((i % 20) < 10 ? [255, 0, 0, 255] : [0, 0, 255, 255], i * 4);
    writeFileSync(join(dir, "split.png"), encodePng(20, 20, 4, pixels));
    const path = join(dir, "t.json");
    writeFileSync(path, JSON.stringify({ version: 1, output: { width: 160, height: 90, fps: 10 }, sources: { split: { type: "image", path: "split.png" } },
      scenes: [{ id: "a", duration: "1s", background: "#000000", transition: { type: "fade", duration: "0.4s" }, layers: [{ type: "stage", nodes: [
        { kind: "image", key: "contain", source: "split", width: 60, height: 20, fit: "contain", x: 40, y: 45 },
        { kind: "image", key: "cover", source: "split", width: 60, height: 20, fit: "cover", x: 120, y: 45 }] }] },
        { id: "b", duration: "1s", background: "#000000" }] }));
    const { plan } = await planFromTimeline(path, dir, "final");
    const [seg] = await renderSegments(plan, ["a"], { out: join(dir, "x.mp4") });
    const last = await rgbFrame(seg!.path, plan.segments[0]!.renderFrames - 1);
    assert.ok(px(last, 12, 45).every((v) => v < 40), `contain letterbox is empty: ${px(last, 12, 45).join(",")}`);
    assert.ok(px(last, 92, 45)[0]! > 180, `cover fills its left edge with red: ${px(last, 92, 45).join(",")}`);
    assert.ok(px(last, 148, 45)[2]! > 180, "cover right edge is blue in the final spare frame");
  });
});

void test("stage validation and capability errors", async (t) => {
  if (!requireFfmpeg(t)) return;
  const authored = TimelineSchema.parse({ version: 1, scenes: [{ id: "a", duration: "1s", layers: [{ type: "stage",
    nodes: [{ kind: "rect", key: "r", width: 10, height: 10 }, { kind: "rect", key: "r", width: 10, height: 10 }],
    tracks: [{ node: "ghost", prop: "x", keys: [{ at: 0, value: 1 }] }, { node: "r", prop: "fill", keys: [{ at: 0, value: 3 }] }] }] }] });
  const issues = validateTimeline(authored, { baseDir: tmpdir() });
  assert.deepEqual(issues.map((i) => i.path).sort(), ["scenes.0.layers.0.nodes.1.key", "scenes.0.layers.0.tracks.0.node",
    "scenes.0.layers.0.tracks.1.keys.0.value"]);
  assert.ok(issues.every((i) => i.code === "E_SCHEMA"));
  const ok = TimelineSchema.parse({ version: 1, scenes: [{ id: "a", duration: "1s", layers: [{ type: "stage", nodes: [{ kind: "rect", key: "r", width: 1, height: 1 }] }] }] });
  const info = await probeFfmpeg();
  const crippled = { ...info, encoders: new Set([...info.encoders].filter((e) => e !== "ffv1")) };
  const resolved = resolveTimeline(ok, { baseDir: tmpdir() });
  assert.throws(() => compileTimeline(resolved, { profile: "proxy", output: { width: 160, height: 90, fps: { num: 10, den: 1 }, background: "#000000",
    container: "mp4", videoCodec: "h264", quality: "proxy", scale: 1, oversample: 1 }, workDir: tmpdir(), ffmpeg: crippled, ffprobe: "ffprobe",
    timelineHash: "x" }), (e: Error & { code?: string }) => e.code === "E_CAPABILITY" && /encoder:ffv1/.test(e.message));
});
