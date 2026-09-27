import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { writeSession } from "../capture/session.ts";
import { preview as previewCommand } from "../cli/commands/preview.ts";
import { locateTools } from "../probe/index.ts";
import { runChecked } from "../shared/index.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";

void test("preview CLI resolves seconds, percent and marker labels", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = mkdtempSync(join(tmpdir(), "vid2-preview-cli-"));
  const before = process.env.VID2_HOME; process.env.VID2_HOME = join(dir, "home");
  try {
    const timeline = join(dir, "timeline.json");
    writeFileSync(timeline, JSON.stringify({ version: 1, output: { width: 320, height: 180, fps: 15 },
      markers: { drop: "1s" }, scenes: [{ id: "one", duration: "2s", background: "#335577" }] }));
    const result = await previewCommand.run({ args: [timeline], values: { at: "0,25%,1.5s,drop", out: "stills" },
      json: true, cwd: dir, stderr: process.stderr });
    const frames = result.data["frames"] as { frame: number; at: string; path: string }[];
    assert.deepEqual(frames.map((item) => item.frame), [0, 8, 23, 15]);
    assert.deepEqual(frames.map((item) => item.at), ["0", "25%", "1.5s", "drop"]);
    assert.ok(frames.every((item) => existsSync(item.path)));
    assert.ok(existsSync(join(dir, "stills", "preview.json")));
  } finally {
    if (before === undefined) delete process.env.VID2_HOME; else process.env.VID2_HOME = before;
    rmSync(dir, { recursive: true, force: true });
  }
});

void test("preview CLI resolves a capture action label and kind index", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = mkdtempSync(join(tmpdir(), "vid2-preview-event-"));
  const before = process.env.VID2_HOME; process.env.VID2_HOME = join(dir, "home");
  try {
    const sessionDir = join(dir, "capture.vid2cap");
    const footage = join(sessionDir, "footage.mp4");
    await writeSession(sessionDir, { version: 1, surface: "web", fps: "15", width: 320, height: 180, scale: 1,
      t0: { epochMs: 0, monoNs: "0" }, footage: "footage.mp4", frames: null, actions: "actions.jsonl",
      cursorHidden: true, recordedText: false, tool: { vid2: "0.1.0", ffmpeg: "test" }, platform: "test",
      createdAt: "2026-01-01T00:00:00Z", warnings: [] },
    [{ id: "click1", seq: 0, kind: "click", label: "hit", tMs: 1000, frame: 15, source: "agent" }]);
    await runChecked(locateTools().ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=15:d=2",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", footage]);
    const timeline = join(dir, "timeline.json");
    writeFileSync(timeline, JSON.stringify({ version: 1, output: { width: 320, height: 180, fps: 15 },
      sources: { cap: { type: "capture", session: sessionDir } },
      scenes: [{ id: "capture", duration: "2s", layers: [{ type: "media", source: "cap" }] }] }));
    const result = await previewCommand.run({ args: [timeline], values: { at: "hit,click#1", out: "events" },
      json: true, cwd: dir, stderr: process.stderr });
    const frames = result.data["frames"] as { frame: number; at: string }[];
    assert.deepEqual(frames.map((item) => item.frame), [15, 15]);
    assert.deepEqual(frames.map((item) => item.at), ["hit", "click#1"]);
  } finally {
    if (before === undefined) delete process.env.VID2_HOME; else process.env.VID2_HOME = before;
    rmSync(dir, { recursive: true, force: true });
  }
});

void test("preview --placeholders makes missing file and generate sources without a provider call", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = mkdtempSync(join(tmpdir(), "vid2-preview-placeholders-"));
  const before = process.env.VID2_HOME; process.env.VID2_HOME = join(dir, "home");
  const beforeIma2 = process.env.IMA2_BIN; process.env.IMA2_BIN = join(dir, "no-ima2");
  try {
    const timeline = join(dir, "timeline.json");
    writeFileSync(timeline, JSON.stringify({ version: 1, output: { width: 320, height: 180, fps: 15 },
      sources: { missing: { type: "image", path: "missing.png" }, overlay: { type: "image", path: "overlay.png" },
        generated: { type: "generate", kind: "image", provider: "ima2", prompt: "hero", options: {} } },
      scenes: [{ id: "one", duration: "1s", layers: [{ type: "media", source: "missing" },
        { type: "overlay", source: "overlay" }, { type: "media", source: "generated" }] }] }));
    const ctx = { args: [timeline], json: true, cwd: dir, stderr: process.stderr };
    await assert.rejects(previewCommand.run({ ...ctx, values: { at: "0" } }));
    const result = await previewCommand.run({ ...ctx, values: { at: "0", placeholders: true, out: "placeholders" } });
    assert.equal((result.data["frames"] as unknown[]).length, 1);
    assert.ok((result.warnings ?? []).filter((warning) => warning.startsWith("W_PLACEHOLDER")).length >= 3);
    assert.ok(existsSync(join(dir, "placeholders", "frame-000000.png")));
  } finally {
    if (before === undefined) delete process.env.VID2_HOME; else process.env.VID2_HOME = before;
    if (beforeIma2 === undefined) delete process.env.IMA2_BIN; else process.env.IMA2_BIN = beforeIma2;
    rmSync(dir, { recursive: true, force: true });
  }
});
