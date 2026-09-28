/** Shared template check (templates.test.ts, template-kinetic.test.ts): init, validate, proxy render with placeholders, QA evidence. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { run } from "../../src/shared/exec.ts";
import { initTemplate } from "../../src/cli/commands/init.ts";
import { qa } from "../../src/cli/commands/qa.ts";
import { tempDir } from "../helpers.ts";

const root = resolve(import.meta.dirname, "../..");
const entry = join(root, "src/cli/index.ts");
export const expected: Record<string, { width: number; height: number; frames: number }> = {
  "launch-teaser": { width: 960, height: 540, frames: 900 },
  "feature-demo": { width: 640, height: 360, frames: 105 },
  changelog: { width: 960, height: 540, frames: 600 },
  "social-vertical": { width: 540, height: 960, frames: 450 },
  "kinetic-launch": { width: 960, height: 540, frames: 900 },
};

export async function vid2(cwd: string, args: string[], home: string): Promise<Record<string, unknown>> {
  const result = await run(process.execPath, [entry, ...args, "--json"], { cwd, env: { ...process.env, VID2_HOME: home } });
  const body = JSON.parse(result.stdout.toString()) as { ok: boolean; data: Record<string, unknown> };
  assert.equal(result.code, 0, result.stderr + result.stdout.toString());
  assert.equal(body.ok, true);
  return body.data;
}

async function videoFacts(path: string): Promise<{ width: number; height: number; frames: number }> {
  const result = await run(process.env["VID2_FFPROBE"] ?? "ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v:0",
    "-show_entries", "stream=width,height,nb_read_packets", "-of", "json", path]);
  assert.equal(result.code, 0, result.stderr);
  const stream = (JSON.parse(result.stdout.toString()) as { streams: { width: number; height: number; nb_read_packets: string }[] }).streams[0]!;
  return { width: stream.width, height: stream.height, frames: Number(stream.nb_read_packets) };
}

export async function checkTemplate(name: string): Promise<void> {
  const dir = tempDir(`vid2-template-${name}-`);
  const home = join(dir, "home");
  const files = await initTemplate(name, dir);
  assert.ok(files.includes("timeline.json") && files.includes("BRIEF.md") && files.includes("README.md"));
  const timeline = join(dir, "timeline.json"), video = join(dir, "proxy.mp4");
  const validation = await vid2(dir, ["validate", timeline], home);
  assert.deepEqual(validation["issues"], []);
  const rendered = await vid2(dir, ["render", timeline, "--profile", "proxy", "--placeholders", "-o", video], home);
  assert.equal(rendered["frames"], expected[name]!.frames);
  assert.deepEqual(await videoFacts(video), expected[name]);
  const report = await qa.run({ args: [video], values: { timeline, out: join(dir, "qa") }, json: true, cwd: dir, stderr: process.stderr });
  const data = report.data as { status: string; artifacts: Record<string, string> };
  assert.notEqual(data.status, "fail", `${name} QA failed`);
  assert.ok(existsSync(data.artifacts["report"]!));
  assert.ok(existsSync(data.artifacts["contact"]!));
  if (name === "feature-demo") {
    const session = join(dir, "demo.vid2cap");
    assert.ok(existsSync(join(session, "footage.mp4")));
    assert.match(readFileSync(join(session, "actions.jsonl"), "utf8"), /"label":"publish"/);
  }
}
