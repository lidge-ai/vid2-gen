import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { planFromTimeline } from "../cli/commands/plan-shared.ts";
import { locateTools } from "../probe/index.ts";
import { renderPlan } from "../render/runner.ts";
import { packageRoot } from "../shared/index.ts";
import { resolveTimeline, TimelineSchema } from "../timeline/index.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";
import { runQa } from "./run.ts";

async function contrastIssues(dir: string, timeline: Record<string, unknown>): Promise<number> {
  const path = join(dir, "t.json");
  writeFileSync(path, JSON.stringify(timeline));
  const { plan } = await planFromTimeline(path, dir, "proxy");
  const out = join(dir, `${Math.random().toString(36).slice(2)}.mp4`);
  await renderPlan(plan, { out });
  const resolved = resolveTimeline(TimelineSchema.parse(timeline), { baseDir: dir });
  const { ffmpeg, ffprobe } = locateTools();
  const report = await runQa({ video: out, timeline: resolved, ffmpeg, ffprobe, out: join(dir, "qa-" + Math.random().toString(36).slice(2)) });
  return report.issues.filter((i) => i.check === "contrast" && /Stage text/.test(i.message)).length;
}

void test("QA flags low-contrast stage text (light grey on white) and passes the default dark field; custom fonts reach layout", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = mkdtempSync(join(tmpdir(), "vid2-qa-stage-"));
  const before = process.env["VID2_HOME"];
  process.env["VID2_HOME"] = join(dir, "home");
  try {
    const font = join(dir, "serif.ttf");
    copyFileSync(join(packageRoot(), "assets/fonts/InstrumentSerif-Regular.ttf"), font);
    const field = (extra: Record<string, unknown>) => ({ type: "field", x: 320, y: 180, width: 400, size: 30, typing: [{ at: "0.1s", text: "search me" }], ...extra });
    const base = { version: 1, output: { width: 640, height: 360, fps: 30 } };
    const bad = await contrastIssues(dir, { ...base, fonts: { custom: { path: font } }, scenes: [{ id: "w", duration: "2s", background: "#FFFFFF",
      layers: [field({ theme: "light", font: "custom", style: { fill: "#FFFFFF", text: "#D1D1D6" } })] }] });
    assert.ok(bad >= 1, "light grey text on white is reported");
    const good = await contrastIssues(dir, { ...base, scenes: [{ id: "d", duration: "2s", background: "#111113", layers: [field({})] }] });
    assert.equal(good, 0, "default dark field passes");
  } finally { if (before === undefined) delete process.env["VID2_HOME"]; else process.env["VID2_HOME"] = before; }
});
