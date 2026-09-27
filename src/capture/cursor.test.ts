import test from "node:test";
import assert from "node:assert/strict";
import { cursorSprite, planCursor, rippleSprite } from "./cursor.ts";

const opts = { fps: { num: 30, den: 1 }, frames: 75, width: 1000, height: 600 };

void test("cursor looks ahead to a click, shrinks, ripples and fades", () => {
  const samples = planCursor([{ frame: 0, point: { x: 100, y: 100 }, kind: "hover" },
    { frame: 30, point: { x: 900, y: 500 }, kind: "click" }], opts);
  assert.equal(samples.length, 75);
  assert.equal(samples[0]!.x, 100);
  assert.ok(samples[25]!.x > 600, `lookahead x=${samples[25]!.x}`);
  assert.equal(samples[25]!.alpha, 1);
  assert.equal(samples[30]!.scale, 0.8);
  assert.equal(samples[30]!.ripples.length, 1);
  assert.equal(samples[30]!.ripples[0]!.age, 0);
  assert.equal(samples[34]!.scale, 1);
  assert.equal(samples[48]!.ripples.length, 0);
  assert.equal(samples[60]!.alpha, 0);
});

void test("ripples are limited to six live click rings", () => {
  const actions = Array.from({ length: 8 }, (_, i) => ({ frame: i * 2, point: { x: 200, y: 200 }, kind: "click" as const }));
  const samples = planCursor(actions, opts);
  assert.equal(samples[14]!.ripples.length, 6);
  assert.ok(samples[14]!.ripples.every((ripple) => ripple.age >= 0 && ripple.age < 0.6));
});

void test("empty cursor action list stays empty and positions remain in bounds", () => {
  assert.deepEqual(planCursor([], opts), []);
  const samples = planCursor([{ frame: 0, point: { x: 2000, y: -50 }, kind: "move" }], opts);
  assert.ok(samples.every((sample) => sample.x >= 0 && sample.x <= opts.width && sample.y >= 0 && sample.y <= opts.height));
});

void test("cursor and ripple sprites have antialiased RGBA and fade out", () => {
  for (const style of ["arrow", "dot"] as const) {
    const sprite = cursorSprite(style, 32);
    assert.equal(sprite.rgba.length, sprite.width * sprite.height * 4);
    assert.ok(sprite.rgba.some((value, i) => i % 4 === 3 && value > 0 && value < 255));
  }
  const early = rippleSprite(20, 0.25), late = rippleSprite(20, 1);
  assert.ok(early.rgba.some((value, i) => i % 4 === 3 && value > 0));
  assert.ok(late.rgba.every((value, i) => i % 4 !== 3 || value === 0));
});
