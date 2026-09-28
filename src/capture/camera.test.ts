import test from "node:test";
import assert from "node:assert/strict";
import { planCamera } from "./camera.ts";
import type { CameraKeyOut, CameraOptions } from "./camera.ts";
import { Vid2Error } from "../shared/errors.ts";

const opts: CameraOptions = { fps: { num: 30, den: 1 }, startFrame: 300, frames: 90, width: 1920, height: 1080 };

function viewAt(keys: CameraKeyOut[], at: number): CameraKeyOut {
  const next = keys.findIndex((key) => key.at >= at);
  if (next <= 0) return keys[0]!;
  const before = keys[next - 1]!, after = keys[next]!;
  const t = (at - before.at) / (after.at - before.at);
  return { at, zoom: before.zoom + (after.zoom - before.zoom) * t,
    x: before.x + (after.x - before.x) * t, y: before.y + (after.y - before.y) * t, ease: "linear" };
}

void test("no positioned actions produce no camera keys", () => {
  assert.deepEqual(planCamera([], opts), []);
  assert.deepEqual(planCamera([{ frame: 10 }], opts), []);
});

void test("camera converges toward a static focus within 0.6 seconds", () => {
  const keys = planCamera([{ frame: 0, point: { x: 1700, y: 540 } }], { ...opts, hold: 1.2 });
  const key = keys.find((item) => Math.abs(item.at - 0.6) < 1e-9);
  assert.ok(key);
  assert.ok(Math.abs(key.zoom - 2.2) < 0.08, `zoom ${key.zoom}`);
  assert.ok(Math.abs(key.x - (1 - 0.5 / 2.2)) < 0.04, `focus ${key.x}`);
  assert.equal(keys[0]!.at, 0);
  assert.ok(keys.every((item) => item.ease === "linear" && item.at < opts.frames / 30));
});

void test("far clicks 0.3 seconds apart merge into one central focus", () => {
  const keys = planCamera([{ frame: 15, point: { x: 100, y: 540 } },
    { frame: 24, point: { x: 1800, y: 540 } }], opts);
  assert.ok(keys.length > 0);
  assert.ok(keys.every((key) => key.x >= 0.45 && key.x <= 0.55));
  assert.ok(Math.max(...keys.map((key) => key.zoom)) < 1.25);
});

void test("every crop remains inside the footage at extreme focus points", () => {
  const keys = planCamera([{ frame: 8, bbox: { x: -20, y: -10, width: 30, height: 20 } }], opts);
  for (const key of keys) {
    const half = 0.5 / key.zoom;
    assert.ok(key.x >= half - 1e-9 && key.x <= 1 - half + 1e-9);
    assert.ok(key.y >= half - 1e-9 && key.y <= 1 - half + 1e-9);
  }
  assert.ok(keys.length <= Math.ceil(opts.frames / 2) + 1);
});

void test("merged dogfood clicks keep both padded targets fully inside the settled view", () => {
  const width = 1280, height = 720;
  const pad = 0.12;
  const boxes = [
    { x: 80, y: 200, width: 400, height: 40 },
    { x: 980, y: 620, width: 120, height: 60 },
  ];
  const actions = boxes.map((bbox, index) => ({ frame: index === 0 ? 19 : 36, bbox }));
  const keys = planCamera(actions, { fps: { num: 30, den: 1 }, startFrame: 0, frames: 120, width, height });
  assert.ok(keys.length > 0);
  for (let frame = 38; frame <= 50; frame++) {
    const key = viewAt(keys, frame / 30);
    const left = width * (key.x - 0.5 / key.zoom), right = width * (key.x + 0.5 / key.zoom);
    const top = height * (key.y - 0.5 / key.zoom), bottom = height * (key.y + 0.5 / key.zoom);
    for (const box of boxes) {
      const px = box.width * pad, py = box.height * pad;
      assert.ok(left <= box.x - px + 1e-6 && right >= box.x + box.width + px - 1e-6,
        `frame ${key.at * 30}: horizontal crop ${left}..${right}`);
      assert.ok(top <= box.y - py + 1e-6 && bottom >= box.y + box.height + py - 1e-6,
        `frame ${key.at * 30}: vertical crop ${top}..${bottom}`);
    }
  }
  assert.equal(viewAt(keys, 48 / 30).zoom, 1);
});

void test("merged targets that fit keep both padded boxes in a zoomed view", () => {
  const width = 1280, height = 720, pad = 0.12;
  const boxes = [
    { x: 400, y: 100, width: 200, height: 150 },
    { x: 430, y: 390, width: 220, height: 110 },
  ];
  const keys = planCamera(boxes.map((bbox, i) => ({ frame: i ? 36 : 19, bbox })),
    { fps: { num: 30, den: 1 }, startFrame: 0, frames: 90, width, height });
  for (let frame = 38; frame <= 50; frame++) {
    const key = viewAt(keys, frame / 30);
    assert.ok(key.zoom > 1.15);
    const left = width * (key.x - 0.5 / key.zoom), right = width * (key.x + 0.5 / key.zoom);
    const top = height * (key.y - 0.5 / key.zoom), bottom = height * (key.y + 0.5 / key.zoom);
    for (const box of boxes) {
      assert.ok(left <= box.x - box.width * pad + 1e-6 && right >= box.x + box.width * (1 + pad) - 1e-6);
      assert.ok(top <= box.y - box.height * pad + 1e-6 && bottom >= box.y + box.height * (1 + pad) - 1e-6);
    }
  }
});

void test("a dense typing trace simplifies to no more than 24 keys", () => {
  const actions = Array.from({ length: 200 }, (_, i) => ({ frame: 10 + i * 2,
    bbox: { x: 800 + i % 3, y: 350, width: 200, height: 40 } }));
  const keys = planCamera(actions, { ...opts, frames: 480, hold: 0.8, merge: 0.8 });
  assert.ok(keys.length <= 24, `kept ${keys.length} keys`);
  assert.equal(keys[0]?.at, 0);
  assert.ok(keys.at(-1)!.at <= 479 / 30);
});

void test("30 alternating corner clicks exceed the camera error budget", () => {
  const actions = Array.from({ length: 30 }, (_, i) => ({ frame: 15 + i * 30,
    point: { x: i % 2 ? 1800 : 120, y: i % 2 ? 900 : 120 } }));
  // Even one corner group moves farther than the 1.5% horizontal tolerance.
  const firstGroup = planCamera(actions.slice(0, 1), { ...opts, frames: 90, hold: 0, merge: 0 });
  assert.ok(Math.max(...firstGroup.map((key) => Math.abs(key.x - 0.5))) > 0.015);
  assert.throws(() => planCamera(actions, { ...opts, frames: 930, hold: 0, merge: 0,
    path: "scenes.2.layers.3.camera" }), (error: unknown) => {
    assert.ok(error instanceof Vid2Error);
    assert.equal(error.code, "E_INPUT");
    assert.equal(error.details?.path, "scenes.2.layers.3.camera");
    return true;
  });
});
