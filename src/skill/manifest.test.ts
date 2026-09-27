import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { loadSkillManifest, PACKAGE_ROOT, sha256, SKILLS_ROOT } from "./manifest.ts";

void test("manifest is deterministic and records packaged file hashes", () => {
  const path = join(PACKAGE_ROOT, "skills-manifest.json");
  const before = readFileSync(path, "utf8");
  const run = spawnSync(process.execPath, [join(PACKAGE_ROOT, "scripts/skills-manifest.mjs")], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(readFileSync(path, "utf8"), before);
  const manifest = loadSkillManifest();
  assert.equal(Object.keys(manifest).length, 6);
  for (const [name, entry] of Object.entries(manifest)) {
    for (const [file, digest] of Object.entries(entry.files)) {
      assert.equal(sha256(readFileSync(join(SKILLS_ROOT, name, file))), digest);
    }
    assert.equal(sha256(JSON.stringify(entry.files)), entry.sha256);
  }
  assert.equal(readFileSync(join(SKILLS_ROOT, "vid2-timeline/assets/timeline.v1.json"), "utf8"),
    readFileSync(join(PACKAGE_ROOT, "schema/timeline.v1.json"), "utf8"));
});

void test("skills lint passes", () => {
  const run = spawnSync(process.execPath, [join(PACKAGE_ROOT, "scripts/skills-lint.mjs")], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /skills lint passed/);
});
