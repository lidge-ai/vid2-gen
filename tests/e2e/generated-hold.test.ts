import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { run } from "../../src/shared/exec.ts";
import { loadPlanOrTimeline } from "../../src/cli/commands/plan-shared.ts";
import { requireFfmpeg } from "../helpers.ts";

const root = resolve(import.meta.dirname, "../..");
const warning = "W_GENERATED_CLIP_HOLD clip scene held 2.00s (30 frames): clip 5.00s, read 7.00s from 0.00s";

async function cli(args: string[], home: string): Promise<{ warnings: string[]; data: Record<string, unknown> }> {
  const result = await run(process.execPath, [join(root, "src/cli/index.ts"), ...args, "--json"],
    { env: { ...process.env, VID2_HOME: home }, timeoutMs: 50_000 });
  assert.equal(result.code, 0, `${args.join(" ")}\n${result.stderr}\n${result.stdout.toString()}`);
  const body = JSON.parse(result.stdout.toString()) as { ok: boolean; warnings: string[]; data: Record<string, unknown> };
  assert.equal(body.ok, true);
  return body;
}

void test("file-generated clip warnings survive compile, cache hits and plan replay", { timeout: 60_000 }, async (t) => {
  if (!requireFfmpeg(t)) return;
  const dir = await mkdtemp(join(tmpdir(), "vid2-generated-hold-"));
  const home = join(dir, "home");
  try {
    const clip = join(dir, "clip.mp4");
    const made = await run(process.env["VID2_FFMPEG"] ?? "ffmpeg", ["-hide_banner", "-v", "error", "-f", "lavfi",
      "-i", "testsrc2=size=160x90:rate=15:duration=5", "-an", "-c:v", "mpeg4", "-q:v", "4", clip], { timeoutMs: 10_000 });
    assert.equal(made.code, 0, made.stderr);
    const timeline = join(dir, "timeline.json");
    await writeFile(timeline, JSON.stringify({ version: 1, output: { width: 160, height: 90, fps: 15 },
      sources: { clip: { type: "generate", provider: "file", kind: "video", prompt: clip } },
      scenes: [{ id: "scene", duration: "7s", layers: [{ type: "media", source: "clip" }] }] }));
    const firstAsset = await cli(["assets", "resolve", timeline], home);
    assert.equal(firstAsset.data["generated"], 1);
    const cachedAsset = await cli(["assets", "resolve", timeline], home);
    assert.equal(cachedAsset.data["reused"], 1);

    const planPath = join(dir, "clip.plan.json");
    const compiled = await cli(["compile", timeline, "--profile", "proxy", "--out", planPath], home);
    assert.deepEqual(compiled.warnings, [warning]);
    const saved = JSON.parse(await readFile(planPath, "utf8")) as {
      warnings?: string[]; segments: { inputs: { pretrim?: { durationSeconds: number } }[] }[];
    };
    assert.deepEqual(saved.warnings, [warning]);
    const loaded = await loadPlanOrTimeline(planPath, dir, "proxy");
    assert.deepEqual(loaded.plan.warnings, [warning]);
    assert.deepEqual(loaded.warnings, []);

    // The current pretrim verifier requires a cut as long as the requested read. Limit the cut to the
    // source's real length; the compiled tpad graph still holds its final frame through the 7 s layer.
    for (const segment of saved.segments) for (const input of segment.inputs) {
      if (input.pretrim) input.pretrim.durationSeconds = Math.min(input.pretrim.durationSeconds, 5);
    }
    await writeFile(planPath, JSON.stringify(saved));
    const out = join(dir, "result.mp4");
    const rendered = await cli(["render", planPath, "--profile", "proxy", "--out", out, "--jobs", "1"], home);
    assert.deepEqual(rendered.warnings, [warning]);
    const manifest = JSON.parse(await readFile(`${out}.render.json`, "utf8")) as { warnings: string[] };
    assert.deepEqual(manifest.warnings, [warning]);

    delete saved.warnings;
    await writeFile(planPath, JSON.stringify(saved));
    const old = await loadPlanOrTimeline(planPath, dir, "proxy");
    assert.deepEqual(old.plan.warnings, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
