import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { run } from "../../src/shared/exec.ts";
import { init, initTemplate, listTemplates } from "../../src/cli/commands/init.ts";
import { main } from "../../src/cli/main.ts";
import { commands, register } from "../../src/cli/registry.ts";
import { qa } from "../../src/cli/commands/qa.ts";
import { requireFfmpeg, tempDir } from "../helpers.ts";

const root = resolve(import.meta.dirname, "../..");
const entry = join(root, "src/cli/index.ts");
const expected = { "launch-teaser": { width: 960, height: 540, frames: 900 },
  "feature-demo": { width: 640, height: 360, frames: 105 },
  changelog: { width: 960, height: 540, frames: 600 },
  "social-vertical": { width: 540, height: 960, frames: 450 },
  "kinetic-launch": { width: 960, height: 540, frames: 900 } } as const;

async function vid2(cwd: string, args: string[], home: string): Promise<Record<string, unknown>> {
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

void test("init lists five templates and protects a non-empty destination", async () => {
  assert.deepEqual(listTemplates(), ["launch-teaser", "feature-demo", "changelog", "social-vertical", "kinetic-launch"]);
  const list = await init.run({ args: [], values: { list: true }, json: true, cwd: tempDir(), stderr: process.stderr });
  assert.deepEqual(list.data["templates"], listTemplates());
  const dir = tempDir("vid2-init-guard-");
  writeFileSync(join(dir, "keep.txt"), "keep");
  await assert.rejects(initTemplate("changelog", dir), /not empty/);
  await initTemplate("changelog", dir, true);
  assert.equal(readFileSync(join(dir, "keep.txt"), "utf8"), "keep");
  assert.ok(existsSync(join(dir, "timeline.json")));
  writeFileSync(join(dir, "timeline.json"), "outdated");
  await initTemplate("changelog", dir, true);
  assert.match(readFileSync(join(dir, "timeline.json"), "utf8"), /"version": 1/);
  await assert.rejects(initTemplate("missing", tempDir()), /unknown template/);
});

void test("init dispatch accepts --list and copies a named template", async () => {
  if (!commands.has("init")) register(init);
  let stdout = "";
  const io = { stdout: { write(value: string) { stdout += value; return true; } } as NodeJS.WritableStream,
    stderr: process.stderr, cwd: root };
  assert.equal(await main(["init", "--list", "--json"], io), 0);
  assert.deepEqual((JSON.parse(stdout) as { data: { templates: string[] } }).data.templates, listTemplates());
  stdout = "";
  const dir = tempDir("vid2-init-dispatch-");
  assert.equal(await main(["init", "feature-demo", dir, "--json"], io), 0);
  assert.equal((JSON.parse(stdout) as { data: { template: string } }).data.template, "feature-demo");
  assert.ok(existsSync(join(dir, "demo.vid2cap", "footage.mp4")));
});

void test("every initialized template validates, proxy-renders and produces QA evidence", async (t) => {
  if (!requireFfmpeg(t)) return;
  for (const name of listTemplates()) await t.test(name, async () => {
    const dir = tempDir(`vid2-template-${name}-`);
    const home = join(dir, "home");
    const files = await initTemplate(name, dir);
    assert.ok(files.includes("timeline.json") && files.includes("BRIEF.md") && files.includes("README.md"));
    const timeline = join(dir, "timeline.json"), video = join(dir, "proxy.mp4");
    const validation = await vid2(dir, ["validate", timeline], home);
    assert.deepEqual(validation["issues"], []);
    const rendered = await vid2(dir, ["render", timeline, "--profile", "proxy", "--placeholders", "-o", video], home);
    assert.equal(rendered["frames"], expected[name].frames);
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
  });
});
