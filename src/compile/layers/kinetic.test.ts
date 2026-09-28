import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { planFromTimeline } from "../../cli/commands/plan-shared.ts";
import { renderPlan } from "../../render/runner.ts";
import { locateTools } from "../../probe/index.ts";
import { runChecked } from "../../shared/index.ts";
import { requireFfmpeg } from "../../../tests/helpers.ts";
import { GraphBuilder } from "../graph.ts";
import type { BuildContext, LayerOf } from "../ir.ts";
import { TimelineSchema, resolveTimeline } from "../../timeline/index.ts";
import { kineticConfig } from "./kinetic.ts";

void test("kinetic glyph stagger converts bars using the beat meter", () => {
  const timeline = TimelineSchema.parse({ version: 1, beat: { bpm: 120, meter: 3 }, scenes: [{ id: "one", duration: "3s",
    layers: [{ type: "kinetic", enter: { glyphStagger: "0.25bar" }, states: [{ at: "0s", text: "ABC" }] }] }] });
  const resolved = resolveTimeline(timeline, { baseDir: process.cwd() });
  const workDir = mkdtempSync(join(tmpdir(), "vid2-kinetic-bar-"));
  const ctx: BuildContext = { graph: new GraphBuilder(), inputs: { add: () => "0:v", list: () => [] },
    width: 1920, height: 1080, scale: 1, fps: resolved.fps, rate: 1, frames: 90, renderFrames: 90,
    background: "#000000", oversample: 1, profile: "final", sceneId: "one", sources: resolved.sources, fonts: resolved.fonts,
    workDir, pngDir: join(workDir, "png"), textBackend: "ass", beat: resolved.beat! };
  const layer = resolved.scenes[0]!.layers[0] as LayerOf<"kinetic">;
  assert.equal(kineticConfig(layer, ctx).enter.glyphStagger, 0.375);
});

void test("a kinetic timeline layer compiles through the profile, emits sound events and renders visible type", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = mkdtempSync(join(tmpdir(), "vid2-kinetic-"));
  const before = process.env["VID2_HOME"];
  process.env["VID2_HOME"] = join(dir, "home");
  try {
    const path = join(dir, "t.json");
    writeFileSync(path, JSON.stringify({ version: 1, output: { width: 640, height: 360, fps: 30, background: "#101012" },
      scenes: [{ id: "k", duration: "2s", layers: [{ type: "kinetic", x: 320, y: 180, size: 48, accent: { color: "#5AC8FA" },
        enter: { style: "type" }, pill: { fill: "#2C2C2E" }, states: [{ at: "0.1s", text: "Ship it {rocket}" }] }] }] }));
    const final = await planFromTimeline(path, dir, "final");
    const proxy = await planFromTimeline(path, dir, "proxy");
    const group = (plan: typeof final.plan) => { const n = plan.stageRenders[0]!.spec.nodes.find((x) => x.key === "kin:pill"); assert.equal(n?.kind, "rect"); return n; };
    assert.ok(Math.abs(group(proxy.plan).width - group(final.plan).width / 2) < 1, "proxy halves authored geometry");
    const events = final.plan.stageRenders[0]!.spec.events.map((e) => e.kind);
    assert.ok(events.includes("glyph") && events.includes("icon"), `events: ${events.join(",")}`);
    const out = join(dir, "k.mp4");
    await renderPlan(proxy.plan, { out });
    const frame = await runChecked(locateTools().ffmpeg, ["-v", "error", "-i", out, "-vf", "select=eq(n\\,50),format=gray", "-frames:v", "1",
      "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"]);
    const bright = [...frame.stdout].filter((v) => v > 200).length;
    assert.ok(bright > 150, `typed text is visible (${bright} bright pixels)`);
  } finally { if (before === undefined) delete process.env["VID2_HOME"]; else process.env["VID2_HOME"] = before; }
});
