import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { planFromTimeline } from "../cli/commands/plan-shared.ts";
import { locateTools } from "../probe/index.ts";
import { renderPlan } from "../render/runner.ts";
import { resolveTimeline, TimelineSchema } from "../timeline/index.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";
import type { QaReport } from "./report.ts";
import { runQa } from "./run.ts";

function workspace(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "vid2-qa-safe-"));
  const before = process.env["VID2_HOME"];
  process.env["VID2_HOME"] = join(dir, "home");
  t.after(() => {
    if (before === undefined) delete process.env["VID2_HOME"];
    else process.env["VID2_HOME"] = before;
  });
  return dir;
}

function timeline(layer: Record<string, unknown>): Record<string, unknown> {
  return { version: 1, output: { width: 640, height: 360, fps: 30 },
    scenes: [{ id: "title", duration: "1s", background: "#111113", layers: [layer] }] };
}

function kinetic(x: number): Record<string, unknown> {
  return { type: "kinetic", x, y: 180, size: 40, enter: { style: "none" }, states: [{ at: 0, text: "Title" }] };
}

function stage(x: number, y = 180): Record<string, unknown> {
  return { type: "stage", nodes: [{ kind: "text", key: "title", text: "Title", x, y, size: 40 }] };
}

async function inspect(dir: string, name: string, authored: Record<string, unknown>,
  opts: { profile?: "proxy" | "final"; waive?: string } = {}): Promise<QaReport> {
  const path = join(dir, `${name}.json`);
  writeFileSync(path, JSON.stringify(authored));
  const { plan } = await planFromTimeline(path, dir, opts.profile ?? "proxy");
  const video = join(dir, `${name}.mp4`);
  await renderPlan(plan, { out: video });
  const resolved = resolveTimeline(TimelineSchema.parse(authored), { baseDir: dir });
  const { ffmpeg, ffprobe } = locateTools();
  return runQa({ video, timeline: resolved, ffmpeg, ffprobe, out: join(dir, `${name}-qa`),
    ...(opts.waive ? { waive: opts.waive } : {}) });
}

void test("QA warns for settled kinetic text outside title-safe margins without failing the report", async (t) => {
  if (!requireFfmpeg(t)) return;
  const report = await inspect(workspace(t), "unsafe", timeline(kinetic(5)));
  const warnings = report.issues.filter((i) => i.check === "text_safe");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.code, "TEXT_SAFE");
  assert.equal(warnings[0]?.severity, "warn");
  assert.equal(warnings[0]?.status, "open");
  assert.equal(report.version, 1);
  assert.equal(report.checks.text_safe, "warn");
  assert.equal(report.checks.contrast, "pass");
  assert.equal(report.status, "warn");
});

void test("QA accepts centered kinetic text", async (t) => {
  if (!requireFfmpeg(t)) return;
  const report = await inspect(workspace(t), "centered", timeline(kinetic(320)));
  assert.equal(report.issues.filter((i) => i.check === "text_safe").length, 0);
  assert.equal(report.checks.text_safe, "pass");
  assert.equal(report.checks.contrast, "pass");
  assert.equal(report.status, "pass");
});

void test("QA uses parent-translated stage geometry in both directions", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = workspace(t);
  for (const [name, parentX, childX, expected] of [["outward", 310, 320, "warn"], ["inward", 320, 0, "pass"]] as const) {
    const report = await inspect(dir, name, timeline({ type: "stage", nodes: [
      { kind: "group", key: "parent", x: parentX },
      { kind: "text", key: "title", parent: "parent", text: "Title", x: childX, y: 180, size: 40 },
    ] }));
    assert.equal(report.checks.text_safe, expected, name);
  }
});

void test("QA title-safe range includes scene offset, layer delay and sampled opaque hold", async (t) => {
  if (!requireFfmpeg(t)) return;
  const authored = { version: 1, output: { width: 640, height: 360, fps: 30 }, scenes: [
    { id: "intro", duration: "1s", background: "#111113" },
    { id: "title", duration: "1.5s", background: "#111113", layers: [{ ...stage(5), start: "0.5s" }] },
  ] };
  const report = await inspect(workspace(t), "delayed", authored);
  const warnings = report.issues.filter((i) => i.check === "text_safe");
  assert.equal(warnings.length, 1);
  // 30 scene frames + 15 layer-delay frames + 12 opaque-hold frames = 57 / 30 s.
  assert.deepEqual(warnings[0]?.range, [1.9, 1.9]);
});

void test("QA scales complete stage bounds once for proxy and final outputs", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = workspace(t);
  for (const profile of ["proxy", "final"] as const) {
    for (const [name, x, y, expected] of [["safe", 540, 180, "pass"], ["right", 600, 180, "warn"],
      ["top", 320, 5, "warn"], ["bottom", 320, 355, "warn"]] as const) {
      const report = await inspect(dir, `${profile}-${name}`, timeline(stage(x, y)), { profile });
      assert.equal(report.facts.width, profile === "proxy" ? 320 : 640);
      assert.equal(report.facts.height, profile === "proxy" ? 180 : 360);
      assert.equal(report.checks.text_safe, expected, `${profile}-${name}`);
    }
  }
});

void test("QA keeps stage title-safe evidence when CLI or timeline waivers cover the sampled time", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = workspace(t);
  const authored = timeline(stage(5));
  const missed = await inspect(dir, "missed", authored, { waive: "text_safe@0-0.3" });
  assert.equal(missed.checks.text_safe, "warn");
  const cli = await inspect(dir, "cli", authored, { waive: "text_safe@0.4-0.4" });
  const declared = await inspect(dir, "declared", { ...authored,
    qa: { waive: [{ check: "text_safe", from: "0.4s", to: "0.4s", reason: "intentional edge title" }] } });
  for (const [report, source, reason] of [[cli, "cli", "CLI waiver"], [declared, "timeline", "intentional edge title"]] as const) {
    const warnings = report.issues.filter((i) => i.check === "text_safe");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.status, "waived");
    assert.equal(warnings[0]?.severity, "warn");
    assert.deepEqual(warnings[0]?.range, [0.4, 0.4]);
    assert.deepEqual(warnings[0]?.waiver, { source, reason });
    assert.equal(report.checks.text_safe, "pass");
    assert.equal(report.status, "pass");
  }
});
