import test from "node:test";
import assert from "node:assert/strict";
import { main } from "./main.ts";

function capture() {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdout: { write(value: string) { stdout += value; return true; } } as NodeJS.WritableStream,
      stderr: { write(value: string) { stderr += value; return true; } } as NodeJS.WritableStream,
    },
    output: () => ({ stdout, stderr }),
  };
}

void test("unknown command returns E_INPUT with discovery list", async () => {
  const c = capture();
  assert.equal(await main(["nonesuch", "--json"], c.io), 2);
  const { stdout, stderr } = c.output();
  assert.equal(stderr, "");
  assert.equal(stdout.trim().split("\n").length, 1);
  const body = JSON.parse(stdout) as { ok: boolean; error: { code: string; details: { commands: string[] } } };
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "E_INPUT");
  assert.ok(body.error.details.commands.includes("validate"));
});

void test("help JSON lists commands and their options", async () => {
  const c = capture();
  assert.equal(await main(["--json", "help"], c.io), 0);
  const body = JSON.parse(c.output().stdout) as { data: { commands: { name: string; options: Record<string, unknown> }[] } };
  for (const name of ["doctor", "schema", "validate", "resolve", "version", "help"]) {
    assert.ok(body.data.commands.some((command) => command.name === name));
  }
  assert.ok(body.data.commands.find((command) => command.name === "doctor")?.options["deep"]);
});

void test("per-command help prints usage", async () => {
  const c = capture();
  assert.equal(await main(["doctor", "--help"], c.io), 0);
  assert.match(c.output().stdout, /vid2 doctor \[--deep\]/);
});

void test("invalid options stay input errors", async () => {
  const c = capture();
  assert.equal(await main(["version", "--bogus", "--json"], c.io), 2);
  const body = JSON.parse(c.output().stdout) as { error: { code: string } };
  assert.equal(body.error.code, "E_INPUT");
});
