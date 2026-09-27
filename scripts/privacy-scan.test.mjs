import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { scanText } from "./privacy-scan.mjs";

test("roadmap and README have no privacy findings", () => {
  const root = new URL("..", import.meta.url);
  for (const path of ["README.md", "devlog/_plan/260927_vid2_roadmap/000_plan.md", "devlog/_plan/260927_vid2_roadmap/080_release.md"]) {
    assert.deepEqual(scanText(readFileSync(new URL(path, root), "utf8"), path), []);
  }
});

test("scanner identifies complete fake secrets and personal data in a temp file", () => {
  const dir = mkdtempSync(join(tmpdir(), "vid2-privacy-"));
  const file = join(dir, "planted.txt");
  const fake = [
    "/" + "Users" + "/sample/project",
    "C:" + "\\Users\\sample\\project",
    "person" + "@example.test",
    "gho_" + "A".repeat(30),
    "github_pat_" + "B".repeat(40),
    "npm_" + "C".repeat(30),
    "sk-" + "D".repeat(32),
    "api-key=" + "E".repeat(24),
  ].join("\n");
  writeFileSync(file, fake);
  const result = spawnSync(process.execPath, [new URL("./privacy-scan.mjs", import.meta.url).pathname, "--paths", file], { encoding: "utf8" });
  assert.equal(result.status, 1);
  for (let line = 1; line <= 8; line++) assert.match(result.stderr, new RegExp(`:${line}:`));
  assert.equal(scanText("short ghp_abc and security@lidge.ai", "ok").length, 0);
});
