import test from "node:test";
import assert from "node:assert/strict";
import { Vid2Error } from "../shared/errors.ts";
import { packageVersion } from "../shared/paths.ts";
import { renderFailure, renderSuccess } from "./output.ts";

void test("success is a single JSON result with the public envelope", () => {
  const version = packageVersion();
  const text = renderSuccess({ command: "version", data: { version } }, true);
  assert.equal(text.split("\n").length, 1);
  assert.deepEqual(JSON.parse(text), {
    ok: true,
    command: "version",
    data: { version },
    artifacts: [], warnings: [], meta: { vid2: version },
  });
});

void test("failure exposes stable code, exit and recovery hint", () => {
  const { text, exit } = renderFailure(new Vid2Error("E_FFMPEG_MISSING", "ffmpeg missing", {
    fix: "install ffmpeg", details: { tool: "ffmpeg" },
  }), true, "doctor");
  assert.equal(exit, 3);
  assert.deepEqual(JSON.parse(text), {
    ok: false,
    command: "doctor",
    error: { code: "E_FFMPEG_MISSING", message: "ffmpeg missing", fix: "install ffmpeg", details: { tool: "ffmpeg" }, retryable: false },
    meta: { vid2: packageVersion() },
  });
});

void test("unexpected failures are internal and do not expose stacks", () => {
  const { text, exit } = renderFailure(new Error("failure details"), true, "version");
  assert.equal(exit, 1);
  const body = JSON.parse(text) as { error: { code: string; details: { cause: string } } };
  assert.equal(body.error.code, "E_INTERNAL");
  assert.equal(body.error.details.cause, "failure details");
  assert.equal(text.includes("stack"), false);
});
