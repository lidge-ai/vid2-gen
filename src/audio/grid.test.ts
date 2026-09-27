import assert from "node:assert/strict";
import { test } from "node:test";
import { beatTime, snapToBeat } from "./grid.ts";

void test("beat times use seconds offset and snap with one frame lead", () => {
  const grid = { bpm: 120, offset: 0.25, meter: 4 };
  assert.equal(beatTime(2, grid), 1.25);
  assert.ok(Math.abs(snapToBeat(1.30, grid, { fps: { num: 30, den: 1 } }) - (1.25 - 1 / 30)) < 1e-9);
  assert.equal(snapToBeat(1.45, grid), 1.45);
});
