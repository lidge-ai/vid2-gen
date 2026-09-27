import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Vid2Error } from "../shared/index.ts";
import { findExecutable } from "../probe/index.ts";
import { requireFfmpeg, tempDir } from "../../tests/helpers.ts";
import { captureTerminal, parseCast, parseTape, requireTerminalTool } from "./terminal.ts";

const fps = { num: 30, den: 1 };
function fixture(path: string): string { return readFileSync(fileURLToPath(new URL(`../../tests/fixtures/capture/${path}`, import.meta.url)), "utf8"); }
function fixturePath(path: string): string { return fileURLToPath(new URL(`../../tests/fixtures/capture/${path}`, import.meta.url)); }

test("VHS tape times account for typing speed and sleeps without recording text", () => {
  const actions = parseTape(fixture("tapes/basic.tape"), fps);
  assert.deepEqual(actions.map(action => [action.kind, action.tMs, action.frame, action.chars]), [
    ["type", 0, 0, 4], ["press", 400, 12, undefined], ["type", 900, 27, 6],
  ]);
  assert.equal(actions[2]?.endMs, 1500);
  assert.ok(!JSON.stringify(actions).includes("secret"));
  assert.throws(() => parseTape('Type "secret', fps), (error: unknown) => error instanceof Vid2Error &&
    error.code === "E_SCHEMA" && !error.message.includes("secret"));
});

test("asciinema cast prefers input events and summarizes output bursts", () => {
  const input = parseCast(fixture("casts/input.cast"), fps);
  assert.equal(input.width, 80);
  assert.equal(input.actions.length, 2);
  assert.deepEqual(input.actions.map(action => [action.kind, action.tMs, action.frame, action.chars]), [
    ["input", 250, 8, 1], ["input", 400, 12, 3],
  ]);
  assert.ok(!JSON.stringify(input.actions).includes("vid2"));
  const output = parseCast(fixture("casts/output.cast"), fps);
  assert.deepEqual(output.actions.map(action => [action.kind, action.label, action.tMs, action.chars]), [
    ["mark", "output#1", 100, 11], ["mark", "output#2", 600, 4],
  ]);
});

test("invalid cast and missing terminal tools report actionable errors", async () => {
  assert.throws(() => parseCast("{}", fps), (error: unknown) => error instanceof Vid2Error && error.code === "E_SCHEMA");
  for (const name of ["vhs", "agg"] as const) {
    assert.throws(() => requireTerminalTool(name, ""), (error: unknown) => error instanceof Vid2Error && error.code === "E_CAPABILITY" && !!error.fix);
  }
  await assert.rejects(captureTerminal({ tape: fixturePath("tapes/basic.tape"), cast: fixturePath("casts/input.cast"),
    fps: 30, out: tempDir() }), (error: unknown) => error instanceof Vid2Error && error.code === "E_INPUT");
});

test("live VHS capture writes playable CFR footage when VHS is installed", async t => {
  if (!requireFfmpeg(t)) return;
  if (!findExecutable("vhs")) { t.skip("vhs is not installed"); return; }
  const out = tempDir("vid2-vhs-test-");
  const session = await captureTerminal({ tape: fixturePath("tapes/basic.tape"), fps: 15, out });
  assert.equal(session.meta.surface, "terminal");
  assert.ok(session.meta.width > 0 && session.meta.height > 0);
  assert.equal(session.actions.length, 3);
});

test("live cast capture writes playable CFR footage when agg is installed", async t => {
  if (!requireFfmpeg(t)) return;
  if (!findExecutable("agg")) { t.skip("agg is not installed"); return; }
  const session = await captureTerminal({ cast: fixturePath("casts/input.cast"), fps: 15, out: tempDir("vid2-agg-test-") });
  assert.equal(session.meta.surface, "terminal");
  assert.ok(session.meta.width > 0 && session.meta.height > 0);
  assert.equal(session.actions.length, 2);
});
