import assert from "node:assert/strict";
import { test } from "node:test";
import { Vid2Error } from "./errors.ts";
import { parseTimeLiteral, toFrames, toSeconds } from "./time.ts";

const fps = { num: 30000, den: 1001 };
const beat = { bpm: 132, meter: 4, offsetFrames: 8 };

test("bar literals use the meter and preserve unrounded seconds", () => {
  assert.equal(toSeconds(parseTimeLiteral("1bar"), { fps, beat }), 240 / 132);
  assert.equal(toSeconds(parseTimeLiteral("2b"), { fps, beat }), 120 / 132);
  assert.equal(toSeconds(parseTimeLiteral("3f"), { fps }), 3003 / 30000);
  assert.equal(toFrames(parseTimeLiteral("1bar"), { fps, beat }, "duration"), 54);
  assert.equal(toFrames(parseTimeLiteral("1bar"), { fps, beat }, "position"), 62);
  assert.equal(toFrames(parseTimeLiteral("2b"), { fps, beat }, "position"), 35);
});

test("bar positions require a beat grid with an actionable schema error", () => {
  assert.throws(() => toFrames(parseTimeLiteral("1bar"), { fps }, "position"),
    (error: unknown) => error instanceof Vid2Error && error.code === "E_SCHEMA" && /add .*beat/.test(error.fix ?? ""));
});
