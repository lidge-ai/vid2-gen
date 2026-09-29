import test from "node:test";
import assert from "node:assert/strict";
import { packageVersion } from "../shared/paths.ts";
import { GROUPS } from "./globals.ts";
import { main } from "./main.ts";
import { commands } from "./registry.ts";
import type { CommandSpec } from "./registry.ts";
import { optionsFor } from "./tree.ts";

function capture() {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdout: { write(value: string) { stdout += value; return true; } } as NodeJS.WritableStream,
      stderr: { write(value: string) { stderr += value; return true; } } as NodeJS.WritableStream,
    },
    out: () => stdout,
    err: () => stderr,
  };
}

async function run(argv: string[]): Promise<{ code: number; out: string; err: string; body: Record<string, unknown> }> {
  const c = capture();
  const code = await main(argv, c.io);
  const out = c.out();
  let body: Record<string, unknown> = {};
  if (argv.includes("--json")) body = JSON.parse(out) as Record<string, unknown>;
  return { code, out, err: c.err(), body };
}

function paths(): { spec: CommandSpec; path: string[]; parents: CommandSpec[] }[] {
  const all: { spec: CommandSpec; path: string[]; parents: CommandSpec[] }[] = [];
  for (const spec of commands.values()) {
    all.push({ spec, path: [spec.name], parents: [] });
    for (const sub of spec.subcommands ?? []) all.push({ spec: sub, path: [spec.name, sub.name], parents: [spec] });
  }
  return all;
}

void test("every command and subcommand has text and JSON help, and no option is defined twice on its path", async () => {
  for (const node of paths()) {
    assert.doesNotThrow(() => optionsFor(node), node.path.join(" "));
    const text = await run([...node.path, "--help"]);
    assert.equal(text.code, 0, node.path.join(" "));
    assert.ok(text.out.includes(node.spec.usage), `${node.path.join(" ")} help shows its synopsis`);
    assert.ok(text.out.includes("--json"), "global options are listed");
    const json = await run([...node.path, "--help", "--json"]);
    const data = json.body["data"] as Record<string, unknown>;
    assert.equal(data["command"], node.path.join(" "));
    assert.equal(data["synopsis"], node.spec.usage);
    assert.ok((node.spec.examples ?? []).length > 0, `${node.path.join(" ")} has an example`);
    for (const [key, option] of Object.entries(node.spec.options)) {
      if (option.type === "string") assert.ok(option.value, `${node.path.join(" ")} --${key} has a value name`);
    }
  }
});

void test("--help never runs the command", async () => {
  const spy: CommandSpec = { name: "zz-spy", summary: "spy", usage: "vid2 zz-spy", options: {}, examples: ["vid2 zz-spy"],
    run() { throw new Error("run called"); } };
  commands.set(spy.name, spy);
  try {
    assert.equal((await run(["zz-spy", "--help"])).code, 0);
    assert.equal((await run(["zz-spy", "--bogus", "--help"])).code, 0);
  } finally { commands.delete(spy.name); }
});

void test("vid2 help <cmd> <sub> matches <cmd> <sub> --help, even with a bad flag", async () => {
  const viaHelp = await run(["help", "audio", "beats"]);
  const viaFlag = await run(["audio", "beats", "--help"]);
  assert.equal(viaHelp.code, 0);
  assert.equal(viaHelp.out, viaFlag.out);
  const bad = await run(["audio", "beats", "--bogus", "--help"]);
  assert.equal(bad.code, 0);
  assert.match(bad.out, /vid2 audio beats <file>/);
});

void test("-v and --version print the version", async () => {
  for (const flag of ["-v", "--version"]) {
    const r = await run([flag]);
    assert.equal(r.code, 0);
    assert.equal(r.out.trim(), `vid2 ${packageVersion()}`);
  }
});

void test("subcommand options are scoped and failures report the full path", async () => {
  const r = await run(["audio", "beats", "--preset", "x", "--json"]);
  assert.equal(r.code, 2);
  assert.equal(r.body["command"], "audio beats");
  assert.equal((r.body["error"] as { code: string }).code, "E_INPUT");
});

void test("a parent without a subcommand explains itself; skill defaults to list", async () => {
  const r = await run(["audio", "--json"]);
  assert.equal(r.code, 2);
  assert.ok(((r.body["error"] as { details: { subcommands: string[] } }).details.subcommands).includes("beats"));
  const s = await run(["skill", "--json"]);
  assert.equal(s.code, 0);
  assert.ok(Array.isArray((s.body["data"] as { skills: unknown[] }).skills));
  const h = await run(["skill", "--help", "--json"]);
  assert.equal((h.body["data"] as { command: string }).command, "skill");
});

void test("typos get suggestions; misplaced subcommands are named", async () => {
  const cases: [string[], string][] = [[["rendr", "--json"], "render"], [["skill", "instal", "--json"], "install"], [["audio", "beatz", "x.wav", "--json"], "beats"]];
  for (const [argv, hint] of cases) {
    const r = await run(argv);
    assert.equal(r.code, 2, argv.join(" "));
    assert.equal((r.body["error"] as { details: { suggestion?: string } }).details.suggestion, hint, argv.join(" "));
  }
  const misplaced = await run(["audio", "--json", "beats"]);
  assert.equal(misplaced.code, 2);
  assert.match((misplaced.body["error"] as { message: string }).message, /beats must directly follow vid2 audio/);
  const valued = await run(["skill", "--agent", "codex", "--json"]);
  assert.doesNotMatch((valued.body["error"] as { message: string }).message, /subcommand/, "an option value is not taken for a subcommand");
  const helpFirst = await run(["audio", "--help", "beats", "--json"]);
  assert.equal(helpFirst.code, 0, "--help before the subcommand word still answers");
  assert.equal((helpFirst.body["data"] as { command: string }).command, "audio beats");
  assert.equal((await run(["help", "audio", "beats", "extra", "--json"])).code, 2);
  assert.equal((await run(["--", "render", "t.json", "--json"])).code, 2);
});

void test("optionsFor refuses a long or short option defined twice on one path", () => {
  const out = { type: "string" as const, short: "o", description: "out" };
  const leaf = (options: CommandSpec["options"]): CommandSpec => ({ name: "leaf", summary: "", usage: "", options, run: () => Promise.reject(new Error("no")) });
  assert.throws(() => optionsFor({ spec: leaf({ out }), parents: [leaf({ out })] }), /--out is defined twice/);
  assert.throws(() => optionsFor({ spec: leaf({ output: out }), parents: [leaf({ out })] }), /-o is defined twice/);
  assert.throws(() => optionsFor({ spec: leaf({ hint: { type: "boolean", short: "h", description: "x" } }), parents: [] }), /-h is defined twice/);
});

void test("main runs the deepest spec with the remaining args; extra args are refused", async () => {
  const audio = commands.get("audio")!;
  const beats = audio.subcommands!.find((s) => s.name === "beats")!;
  const original = beats.run.bind(beats);
  let seen: string[] = [];
  beats.run = (ctx) => { seen = ctx.args; return Promise.resolve({ command: "audio beats", data: {} }); };
  try {
    assert.equal((await run(["audio", "beats", "x.wav"])).code, 0);
    assert.deepEqual(seen, ["x.wav"]);
  } finally { beats.run = original; }
  assert.equal((await run(["skill", "path", "a", "b", "--json"])).code, 2);
});

void test("root help lists every group and every command once", async () => {
  const r = await run(["--help"]);
  assert.equal(r.code, 0);
  for (const [, title] of GROUPS) assert.ok(r.out.includes(`${title}:`), title);
  for (const name of commands.keys()) {
    const rows = r.out.split("\n").filter((line) => line.startsWith(`    ${name} `) || line === `    ${name}`);
    assert.equal(rows.length, 1, name);
  }
  const json = await run(["help", "--json"]);
  const data = json.body["data"] as { usage: string; commands: { name: string; options: unknown; subcommands: unknown[] }[]; environment: unknown[] };
  assert.equal(typeof data.usage, "string");
  assert.ok(data.commands.find((c) => c.name === "audio")!.subcommands.length >= 6);
  assert.ok(data.environment.length > 3);
});
