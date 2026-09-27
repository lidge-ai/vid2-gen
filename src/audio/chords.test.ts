import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChord, progressionFor } from "./chords.ts";

void test("chord parser accepts major, minor, seventh and suspensions", () => {
  assert.equal(parseChord("Am").quality, "min");
  assert.equal(parseChord("C").quality, "maj");
  assert.equal(parseChord("G7").quality, "7");
  assert.ok(parseChord("G7").frequencies[2] > parseChord("G").frequencies[2]);
  assert.equal(parseChord("Dsus2").quality, "sus2");
  assert.equal(parseChord("Fsus4").quality, "sus4");
  assert.ok(parseChord("Am").frequencies[0] > 100);
  assert.throws(() => parseChord("Hq"), { code: "E_INPUT" });
});

void test("default keys and custom progression resolve to chord frequencies", () => {
  for (const key of ["Am", "C", "Dm", "Em"]) assert.equal(progressionFor(key).length, 4);
  assert.deepEqual(progressionFor("C", ["Am", "F"]).map((chord) => chord.name), ["Am", "F"]);
});
