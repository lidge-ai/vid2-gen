import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { packageVersion } from "../../src/shared/paths.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const bin = join(root, "bin/vid2.js");
const entry = existsSync(bin) ? bin : join(root, "src/cli/index.ts");

function cli(args: string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, [entry, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env, VID2_JSON: "0" },
  });
}

function body(result: ReturnType<typeof cli>): Record<string, unknown> {
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

void test("schema and version produce one JSON object", () => {
  const schema = cli(["schema", "--json"]);
  assert.equal(schema.status, 0, schema.stderr);
  assert.equal(schema.stdout.trim().split("\n").length, 1);
  assert.deepEqual(body(schema)["data"], JSON.parse(readFileSync(join(root, "schema/timeline.v1.json"), "utf8")));
  const version = cli(["version", "--json"]);
  assert.equal(version.status, 0, version.stderr);
  assert.equal((body(version)["data"] as Record<string, unknown>)["version"], packageVersion());
});

void test("validate and resolve a minimal timeline", () => {
  const dir = mkdtempSync(join(tmpdir(), "vid2-cli-"));
  const path = join(dir, "timeline.json");
  writeFileSync(path, JSON.stringify({ version: 1, scenes: [{ id: "opening", duration: "2s" }] }));
  const validation = cli(["validate", path, "--json"]);
  assert.equal(validation.status, 0, validation.stderr || validation.stdout);
  assert.equal(((body(validation)["data"] as Record<string, unknown>)["summary"] as Record<string, unknown>)["totalFrames"], 60);
  const resolved = cli(["resolve", path, "--json"]);
  assert.equal(resolved.status, 0, resolved.stderr || resolved.stdout);
  assert.equal((body(resolved)["data"] as Record<string, unknown>)["totalFrames"], 60);
});

void test("validate reports relational issues with paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "vid2-invalid-cli-"));
  const path = join(dir, "timeline.json");
  writeFileSync(path, JSON.stringify({ version: 1, scenes: [{ id: "opening", duration: "2s", layers: [{ type: "media", source: "missing" }] }] }));
  const result = cli(["validate", path, "--json"]);
  assert.equal(result.status, 2, result.stderr || result.stdout);
  const error = body(result)["error"] as { details: { issues: { path: string }[] } };
  assert.ok(error.details.issues.some((issue) => issue.path === "scenes.0.layers.0.source"));
});

void test("doctor reports a missing ffmpeg path as capability exit 3", () => {
  const missing = join(tmpdir(), "vid2-missing-ffmpeg-binary");
  const result = cli(["doctor", "--json"], { VID2_FFMPEG: missing, VID2_FFPROBE: missing });
  assert.equal(result.status, 3, result.stderr || result.stdout);
  assert.equal((body(result)["error"] as Record<string, unknown>)["code"], "E_FFMPEG_MISSING");
});

void test("doctor fake runner covers old and supported ffmpeg", () => {
  for (const [version, status] of [["5.1", 3], ["7.0", 0], ["8.0", 0]] as const) {
    const result = cli(["doctor", "--json"], {
      NODE_ENV: "test", VID2_TEST_FFMPEG_RUNNER: "node-fake", FAKE_FFMPEG_VERSION: version,
    });
    assert.equal(result.status, status, `${version}: ${result.stderr || result.stdout}`);
    if (version === "7.0") assert.match(result.stdout, /7\.1/);
    if (version === "5.1") assert.match(result.stdout, /upgrade|install/i);
  }
});

void test("doctor test runner hook is ignored outside test mode", () => {
  const result = cli(["doctor", "--json"], {
    NODE_ENV: "production", VID2_TEST_FFMPEG_RUNNER: "node-fake", FAKE_FFMPEG_VERSION: "5.1",
  });
  assert.ok(result.status === 0 || result.status === 3);
  assert.doesNotMatch(result.stdout, /node-fake:ffmpeg/);
});
