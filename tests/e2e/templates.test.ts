import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { init, initTemplate, listTemplates } from "../../src/cli/commands/init.ts";
import { main } from "../../src/cli/main.ts";
import { commands, register } from "../../src/cli/registry.ts";
import { requireFfmpeg, tempDir } from "../helpers.ts";
import { checkTemplate } from "./template-check.ts";

const root = resolve(import.meta.dirname, "../..");
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
  // kinetic-launch runs in template-kinetic.test.ts (own time budget).
  for (const name of listTemplates().filter((n) => n !== "kinetic-launch")) await t.test(name, () => checkTemplate(name));
});
