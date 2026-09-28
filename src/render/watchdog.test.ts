import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { DEFAULT_STALL_MS, StallWatch, stallLimitMs } from "./watchdog.ts";

test("stall limit reads VID2_FFMPEG_STALL_MS and ignores invalid values", () => {
  assert.equal(stallLimitMs({}), DEFAULT_STALL_MS);
  assert.equal(stallLimitMs({ VID2_FFMPEG_STALL_MS: "250" }), 250);
  assert.equal(stallLimitMs({ VID2_FFMPEG_STALL_MS: "0" }), DEFAULT_STALL_MS);
  assert.equal(stallLimitMs({ VID2_FFMPEG_STALL_MS: "soon" }), DEFAULT_STALL_MS);
});

test("advancing frames keep the watch quiet and a frozen frame fires once", async () => {
  let fired = 0;
  const watch = new StallWatch(120, () => { fired += 1; });
  for (let frame = 1; frame <= 6; frame += 1) {
    watch.progress(frame);
    await new Promise((done) => setTimeout(done, 40));
  }
  assert.equal(fired, 0);
  watch.progress(6);
  await new Promise((done) => setTimeout(done, 260));
  assert.equal(fired, 1);
  assert.equal(watch.fired, true);
  assert.equal(watch.frame, 6);
});

test("the watch kills an idle child process", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"]);
  const watch = new StallWatch(100, () => child.kill("SIGKILL"));
  const signal = await new Promise((done) => child.on("close", (_code, sig) => done(sig)));
  watch.stop();
  assert.equal(signal, "SIGKILL");
  assert.equal(watch.fired, true);
});
