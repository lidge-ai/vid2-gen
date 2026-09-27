import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";
import { run } from "../shared/index.ts";
import type { Runner } from "../shared/index.ts";
import { KNOWN_BUGS } from "./bugs.ts";
import { probeFfmpeg } from "./ffmpeg.ts";

const fake: Runner = (_cmd, args, opts) => run(process.execPath, [fileURLToPath(new URL("../../tests/fixtures/bin/fake-ffmpeg.mjs", import.meta.url)), ...args], opts);

void test("8.0 drawtext bug is affected and canary reports a defined outcome", async () => {
  const tools = { ffmpeg: "fake", ffprobe: "fake" };
  const info = await probeFfmpeg({ runner: fake, tools });
  const bug = KNOWN_BUGS.find((item) => item.id === "drawtext-animated-fontsize-segv");
  assert.ok(bug);
  assert.equal(bug.affects(info), true);
  assert.ok(["present", "absent", "skipped"].includes(await bug.canary(info, tools, fake)));
  assert.match(KNOWN_BUGS.find((item) => item.id === "xfade-short-first-input")?.workaround ?? "", /Pad/);
});
