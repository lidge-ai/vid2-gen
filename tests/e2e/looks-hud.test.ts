import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { compileTimeline, timelineHash, timelineOutput } from "../../src/compile/plan.ts";
import type { RenderPlan } from "../../src/compile/ir.ts";
import { probeFfmpeg } from "../../src/probe/index.ts";
import { applyProfile } from "../../src/render/profiles.ts";
import { renderPlan } from "../../src/render/runner.ts";
import { runChecked } from "../../src/shared/index.ts";
import { resolveTimeline } from "../../src/timeline/resolve.ts";
import { TimelineSchema } from "../../src/timeline/schema.ts";
import { validateTimeline } from "../../src/timeline/validate.ts";
import { requireFfmpeg, tempDir } from "../helpers.ts";

void test("riso plus HUD survives cut, fade, serialization, and absolute-time chunking", async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = tempDir("vid2-looks-hud-");
  process.env["VID2_HOME"] = join(dir, "home");
  const authored = TimelineSchema.parse({ version: 1, output: { width: 640, height: 360, fps: 30 },
    look: { preset: "riso", strength: 0.6, seed: 23 },
    scenes: [
      { id: "opening", duration: "1s", background: "#1C3860" },
      { id: "middle", duration: "1.5s", background: "#DC8C70", transition: { type: "fade", duration: "0.5s" } },
      { id: "close", duration: "1s", background: "#87A865" },
    ], overlays: [{ type: "hud", label: "REC", size: 28, margin: 48,
      counter: { keys: [{ at: "0s", value: 30 }, { at: "89f", value: 99.9 }], decimals: 1 },
      timecode: { mode: "frames" } }] });
  assert.deepEqual(validateTimeline(authored, { baseDir: dir }), []);
  const resolved = resolveTimeline(authored, { baseDir: dir });
  const info = await probeFfmpeg();
  const output = applyProfile(timelineOutput(resolved), "proxy");
  assert.deepEqual([output.width, output.height, resolved.totalFrames], [320, 180, 90]);

  async function rendered(name: string, hudChunkSeconds?: number): Promise<string> {
    const workDir = join(dir, name);
    mkdirSync(workDir, { recursive: true });
    const plan = compileTimeline(resolved, { profile: "proxy", output, workDir, ffmpeg: info,
      ffprobe: process.env["VID2_FFPROBE"] ?? "ffprobe", timelineHash: timelineHash(resolved),
      ...(hudChunkSeconds === undefined ? {} : { hudChunkSeconds }) });
    assert.equal(plan.post.look?.preset, "riso");
    assert.equal(plan.join.steps[0]?.kind, "concat");
    assert.equal(plan.join.steps[1]?.kind, "xfade");
    assert.equal(plan.post.hud?.renders.length, hudChunkSeconds === undefined ? 1 : 3);
    assert.deepEqual(plan.post.hud?.renders, plan.stageRenders.map((render) => render.id));
    const serialized = JSON.parse(JSON.stringify(plan)) as RenderPlan;
    const out = join(dir, `${name}.mp4`);
    await renderPlan(serialized, { out, jobs: 2 });
    const md5 = await runChecked(info.path, ["-hide_banner", "-v", "error", "-i", out, "-f", "framemd5", "pipe:1"]);
    const frames = md5.stdout.toString("utf8").split("\n").filter((line) => line && !line.startsWith("#"));
    assert.equal(frames.length, 90);
    return frames.join("\n");
  }

  const whole = await rendered("whole");
  assert.equal(await rendered("chunks", 1), whole);
});
