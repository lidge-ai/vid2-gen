import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { installSkills, skillPath } from "./index.ts";
import { SKILLS_ROOT } from "./manifest.ts";
import { skill } from "../cli/commands/skill.ts";
import { renderSuccess } from "../cli/output.ts";

const SKILL_COUNT = readdirSync(SKILLS_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory()).length;

void test("every packaged skill install by content hash and second install changes zero", () => {
  const target = mkdtempSync(join(tmpdir(), "vid2-skill-install-"));
  try {
    const first = installSkills({ dir: target });
    assert.equal(first.installed.length, SKILL_COUNT);
    assert.ok(first.changedCount > SKILL_COUNT);
    for (const path of first.installed) assert.ok(existsSync(join(path, "SKILL.md")));
    const second = installSkills({ dir: target });
    assert.equal(second.changedCount, 0);
    assert.deepEqual(second.installed, first.installed);
    const local = join(target, "vid2", "SKILL.md");
    writeFileSync(local, "local edit");
    const third = installSkills({ dir: target });
    assert.deepEqual(third.changed, [local]);
    assert.equal(readFileSync(local, "utf8"), readFileSync(skillPath(), "utf8"));
  } finally { rmSync(target, { recursive: true, force: true }); }
});

void test("skill list and path produce JSON command data", async () => {
  const ctx = { values: {}, json: true, cwd: process.cwd(), stderr: process.stderr };
  const listed = await skill.run({ ...ctx, args: ["list"] });
  const body = JSON.parse(renderSuccess(listed, true)) as { data: { skills: { name: string }[] } };
  assert.equal(body.data.skills.length, SKILL_COUNT);
  assert.ok(body.data.skills.some((s) => s.name === "vid2-timeline"));
  const path = await skill.run({ ...ctx, args: ["path", "vid2-audio"] });
  const answer = JSON.parse(renderSuccess(path, true)) as { data: { name: string; path: string } };
  assert.equal(answer.data.name, "vid2-audio");
  assert.ok(existsSync(answer.data.path));
});

void test("skill install --tmp and link are repeatable", async () => {
  const target = mkdtempSync(join(tmpdir(), "vid2-skill-link-"));
  try {
    const ctx = { values: { dir: target, link: true }, json: true, cwd: process.cwd(), stderr: process.stderr, args: ["install"] };
    const first = await skill.run(ctx);
    const second = await skill.run(ctx);
    assert.equal(first.data["changedCount"], SKILL_COUNT);
    assert.equal(second.data["changedCount"], 0);
    const temp = await skill.run({ ...ctx, values: { tmp: true } });
    assert.equal(typeof temp.data["target"], "string");
    assert.equal((temp.data["installed"] as string[]).length, SKILL_COUNT);
  } finally { rmSync(target, { recursive: true, force: true }); }
});
