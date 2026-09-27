import assert from "node:assert/strict";
import { test } from "node:test";
import { Vid2Error } from "../shared/index.ts";
import { mapEventFrame } from "./session.ts";
import { jpegDimensions, quantize } from "./quantize.ts";

test("quantizer and event clock share rounded CFR slots", () => {
  const fps = { num: 10, den: 1 };
  assert.deepEqual(quantize([{ n: 0, tMs: 0 }, { n: 1, tMs: 250 }, { n: 2, tMs: 500 }], 700, fps),
    [0, 0, 0, 1, 1, 2, 2]);
  assert.equal(mapEventFrame(250, fps), 3);
  assert.equal(mapEventFrame(-10, fps), 0);
});

test("invalid screencast JPEG is a capability failure", () => {
  assert.throws(() => jpegDimensions(Buffer.from("not a jpeg")),
    (error: unknown) => error instanceof Vid2Error && error.code === "E_CAPABILITY");
});
