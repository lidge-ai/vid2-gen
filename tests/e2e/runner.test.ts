import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const runner = fileURLToPath(new URL("../../scripts/test.mjs", import.meta.url));
const helpers = new URL("../helpers.ts", import.meta.url).href;

function fixture(kind?: "ffmpeg" | "playwright"): string {
  const root = mkdtempSync(join(tmpdir(), "vid2-runner-"));
  if (kind) {
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/tool.test.ts"), `
      import { test } from "node:test";
      import { require${kind === "ffmpeg" ? "Ffmpeg" : "Playwright"} } from ${JSON.stringify(helpers)};
      test("requires ${kind}", ${kind === "ffmpeg" ? "(t) => { requireFfmpeg(t); }" : "async (t) => { await requirePlaywright(t); }"});
    `);
  }
  return root;
}

function run(root: string, extra: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [runner, "--root", root], {
    encoding: "utf8",
    env: { ...process.env, ...extra },
  });
}

test("runner fails when it finds no tests", () => {
  const result = run(fixture());
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no test files/i);
});

test("ffmpeg requirement skips locally and fails when required", () => {
  const root = fixture("ffmpeg");
  const missingPath = mkdtempSync(join(tmpdir(), "vid2-empty-path-"));
  const env = { PATH: missingPath, VID2_FFMPEG: "", VID2_FFPROBE: "", VID2_REQUIRE_FFMPEG: "" };
  const skipped = run(root, env);
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.match(skipped.stdout, /ffmpeg not available/);
  const required = run(root, { ...env, VID2_REQUIRE_FFMPEG: "1" });
  assert.equal(required.status, 1);
  assert.match(required.stdout, /ffmpeg is required/);
});

test("playwright requirement skips locally and fails when required", () => {
  const root = fixture("playwright");
  const browsers = mkdtempSync(join(tmpdir(), "vid2-empty-browsers-"));
  const env = { PLAYWRIGHT_BROWSERS_PATH: browsers, VID2_REQUIRE_PLAYWRIGHT: "" };
  const skipped = run(root, env);
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.match(skipped.stdout, /playwright chromium not available/);
  const required = run(root, { ...env, VID2_REQUIRE_PLAYWRIGHT: "1" });
  assert.equal(required.status, 1);
  assert.match(required.stdout, /playwright chromium is required/);
});
