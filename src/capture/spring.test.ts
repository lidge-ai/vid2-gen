import test from "node:test";
import assert from "node:assert/strict";
import { stepSpring } from "./spring.ts";

void test("analytic spring step composes across equal time intervals", () => {
  for (const damping of [10, 40, 60]) {
    const params = { stiffness: 200, damping, mass: 2.25, snapDistance: 0, snapVelocity: 0 };
    const start = { value: 0, velocity: 2 };
    const once = stepSpring(start, 1, 0.2, params);
    const twice = stepSpring(stepSpring(start, 1, 0.1, params), 1, 0.1, params);
    assert.ok(Math.abs(once.value - twice.value) < 1e-12, `damping ${damping}`);
    assert.ok(Math.abs(once.velocity - twice.velocity) < 1e-12, `damping ${damping}`);
  }
});

void test("camera spring converges and snaps to its target", () => {
  const params = { stiffness: 200, damping: 40, mass: 2.25 };
  let state = { value: 0, velocity: 0 };
  for (let i = 0; i < 30; i++) state = stepSpring(state, 1, 1 / 30, params);
  assert.ok(Math.abs(state.value - 1) < 0.01);
  for (let i = 0; i < 60; i++) state = stepSpring(state, 1, 1 / 30, params);
  assert.deepEqual(state, { value: 1, velocity: 0 });
});

void test("spring rejects invalid parameters", () => {
  assert.throws(() => stepSpring({ value: 0, velocity: 0 }, 1, -1, { stiffness: 200, damping: 40, mass: 1 }), RangeError);
  assert.throws(() => stepSpring({ value: 0, velocity: 0 }, 1, 1, { stiffness: 0, damping: 40, mass: 1 }), RangeError);
});
