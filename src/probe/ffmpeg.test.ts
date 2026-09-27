import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { run } from "../shared/index.ts";
import type { Runner } from "../shared/index.ts";
import { requireFfmpeg } from "../../tests/helpers.ts";
import { doctorReport } from "./index.ts";
import { locateTools, parseCapabilities, probeFfmpeg } from "./ffmpeg.ts";

const fixture = (name: string): string => readFileSync(new URL(`../../tests/fixtures/probe/${name}`, import.meta.url), "utf8");
const fake: Runner = (_cmd, args, opts) => run(process.execPath, [fileURLToPath(new URL("../../tests/fixtures/bin/fake-ffmpeg.mjs", import.meta.url)), ...args], opts);

void test("parses captured FFmpeg capability listings", () => {
  assert.ok(parseCapabilities(fixture("filters.txt"), "filters").has("xfade"));
  assert.ok(parseCapabilities(fixture("filters.txt"), "filters").has("drawtext"));
  assert.ok(parseCapabilities(fixture("encoders.txt"), "codecs").has("h264_videotoolbox"));
  assert.ok(parseCapabilities(fixture("devices.txt"), "devices").has("avfoundation"));
});

void test("injected runner produces typed capabilities without touching the cache", async () => {
  const info = await probeFfmpeg({ runner: fake, tools: { ffmpeg: "fake", ffprobe: "fake" } });
  assert.equal(info.major, 8);
  assert.equal(info.libs.ass, true);
  assert.ok(info.filters.has("xfade"));
});

void test("doctor classifies old and recommended versions", async () => {
  const previous = { node: process.env.NODE_ENV, hook: process.env.VID2_TEST_FFMPEG_RUNNER, version: process.env.FAKE_FFMPEG_VERSION };
  process.env.NODE_ENV = "test"; process.env.VID2_TEST_FFMPEG_RUNNER = "node-fake";
  try {
    process.env.FAKE_FFMPEG_VERSION = "5.1";
    const old = await doctorReport({ deep: false });
    assert.equal(old.exit, 3);
    assert.match(old.error?.message ?? "", /too old/);
    assert.match(old.fix ?? "", /Install or upgrade/);
    const serialized: unknown = JSON.parse(JSON.stringify(old));
    assert.equal((serialized as { exit: number }).exit, 3);
    process.env.FAKE_FFMPEG_VERSION = "7.0";
    const recommended = await doctorReport({ deep: false });
    assert.equal(recommended.exit, 0);
    assert.ok(recommended.warnings.some((s) => s.includes("7.1")));
    process.env.FAKE_FFMPEG_VERSION = "8.0";
    assert.equal((await doctorReport({ deep: false })).exit, 0);
  } finally {
    for (const [key, value] of Object.entries({ NODE_ENV: previous.node, VID2_TEST_FFMPEG_RUNNER: previous.hook, FAKE_FFMPEG_VERSION: previous.version })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

void test("missing explicit path is a capability error", () => {
  const previous = process.env.VID2_FFMPEG;
  process.env.VID2_FFMPEG = "/missing/ffmpeg";
  try { assert.throws(() => locateTools(), { code: "E_FFMPEG_MISSING" }); }
  finally { if (previous === undefined) delete process.env.VID2_FFMPEG; else process.env.VID2_FFMPEG = previous; }
});

void test("live FFmpeg probe finds xfade", async (t) => {
  if (!requireFfmpeg(t)) return;
  const info = await probeFfmpeg({ refresh: true });
  assert.ok(info.filters.has("xfade"));
});

void test("node-fake hook is ignored outside NODE_ENV=test", () => {
  const before = { env: process.env.NODE_ENV, hook: process.env.VID2_TEST_FFMPEG_RUNNER, path: process.env.PATH };
  delete process.env.PATH;
  process.env.VID2_TEST_FFMPEG_RUNNER = "node-fake";
  try {
    process.env.NODE_ENV = "production";
    assert.throws(() => locateTools(), { code: "E_FFMPEG_MISSING" });
    process.env.NODE_ENV = "test";
    assert.equal(locateTools().ffmpeg, "node-fake:ffmpeg");
  } finally {
    for (const [key, value] of Object.entries({ NODE_ENV: before.env, VID2_TEST_FFMPEG_RUNNER: before.hook, PATH: before.path })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
