/** vid2 example <ls|show|new|path>: the packaged example films, copied into a workspace on demand (030). */
import { Vid2Error } from "../../shared/errors.ts";
import { listExamples, loadExample, syncWorkspace, workspaceFor, workspaceReady } from "../../examples/index.ts";
import type { CommandResult } from "../output.ts";
import type { CommandSpec } from "../registry.ts";
import { parentCommand } from "../tree.ts";
import { listTemplates } from "./init.ts";
import { resolve } from "node:path";

function one(sub: string, args: string[]): string {
  if (args.length !== 1) throw new Vid2Error("E_INPUT", `example ${sub} needs one example name`, { fix: "run vid2 example ls" });
  return args[0]!;
}

function lsText(rows: { name: string; durationS?: number; title: string; ready: boolean }[]): string {
  const width = Math.max(...rows.map((r) => r.name.length)) + 2;
  const lines = rows.map((r) => `  ${r.name.padEnd(width)}${r.durationS ? `${String(r.durationS).padStart(3)} s  ` : "        "}${r.title}${r.ready ? "  (workspace ready)" : ""}`);
  return ["", ...lines, "", "  vid2 example show <name>        what it needs and its steps",
    "  cd \"$(vid2 example new <name>)\"  copy it into a workspace and start", ""].join("\n");
}

const lsSpec: CommandSpec = {
  name: "ls", summary: "List the example films and whether their workspaces exist",
  usage: "vid2 example ls [--json]", options: {}, examples: ["vid2 example ls", "vid2 example ls --json"],
  run({ args }) {
    if (args.length) return Promise.reject(new Vid2Error("E_INPUT", "example ls takes no arguments"));
    const rows = listExamples().map((name) => {
      const { manifest } = loadExample(name);
      return { name, title: manifest.title, summary: manifest.summary, ...(manifest.durationS ? { durationS: manifest.durationS } : {}),
        needs: manifest.needs, goodFor: manifest.goodFor, workspace: workspaceFor(name), ready: workspaceReady(name) };
    });
    return Promise.resolve({ command: "example ls", data: { examples: rows, templates: listTemplates() }, text: lsText(rows) });
  },
};

function showText(data: ReturnType<typeof loadExample>["manifest"], workspace: string): string {
  const needs = data.needs.map((n) => `${n.tool}${n.optional ? " (optional)" : ""}${n.note ? `: ${n.note}` : ""}`);
  return ["", `  ${data.title}`, "", `  ${data.summary}`, "", "  Needs:", ...needs.map((n) => `    ${n}`),
    "", "  Edit for your own film:", ...data.edit.map((e) => `    ${e.file}: ${e.what}`),
    "", "  Steps:", `    cd "$(vid2 example new ${data.name})"   # ${workspace}`, ...data.steps.map((s) => `    ${s.run}`),
    "", `  Output: ${data.output}`, ""].join("\n");
}

const showSpec: CommandSpec = {
  name: "show", summary: "Show what an example makes, what it needs and its exact steps",
  usage: "vid2 example show <name> [--json]", options: {}, examples: ["vid2 example show opus-astra-paper"],
  run({ args }) {
    const name = one("show", args);
    const { manifest, source, readme } = loadExample(name);
    const workspace = workspaceFor(name);
    return Promise.resolve({ command: "example show", data: { ...manifest, source, readme, workspace, ready: workspaceReady(name) },
      text: showText(manifest, workspace) });
  },
};

const newSpec: CommandSpec = {
  name: "new", summary: "Copy an example's sources into its workspace and print the path",
  usage: "vid2 example new <name> [--dir <path>] [--force] [--json]",
  description: "Files already in the destination are kept, so your edits survive a re-run; --force refreshes them from the package.\n"
    + "media/, out/, .work/ and *.vid2cap/ are never copied or touched. A non-empty --dir that is not this example's workspace needs --force.",
  options: {
    dir: { type: "string", value: "<path>", description: "Copy into this directory instead", default: "$VID2_HOME/examples/<name>" },
    force: { type: "boolean", description: "Overwrite existing source files, and allow a non-empty --dir" },
  },
  examples: ['cd "$(vid2 example new opus-astra-paper)"', "vid2 example new vid2-intro --dir ./intro", "vid2 example new vid2-intro --force"],
  run({ args, values, cwd, json, stderr }): Promise<CommandResult> {
    const name = one("new", args);
    const { manifest } = loadExample(name);
    const dest = typeof values["dir"] === "string" ? resolve(cwd, values["dir"]) : undefined;
    const synced = syncWorkspace(name, dest, { force: values["force"] === true });
    if (!json && synced.skipped.length) stderr.write(`vid2: kept ${synced.skipped.length} existing file(s) in ${synced.path}; --force refreshes them\n`);
    return Promise.resolve({ command: "example new", data: { name, path: synced.path, source: synced.source, files: synced.files,
      copied: synced.copied, skipped: synced.skipped, steps: manifest.steps, output: manifest.output },
      artifacts: [synced.path], text: synced.path });
  },
};

const pathSpec: CommandSpec = {
  name: "path", summary: "Print an example's workspace path (or its packaged source folder)",
  usage: "vid2 example path <name> [--source] [--json]",
  options: { source: { type: "boolean", description: "Print the packaged source folder instead of the workspace" } },
  examples: ["vid2 example path vid2-intro", "vid2 example path vid2-intro --source"],
  run({ args, values }) {
    const name = one("path", args);
    const { source } = loadExample(name);
    const path = values["source"] === true ? source : workspaceFor(name);
    return Promise.resolve({ command: "example path", data: { name, path }, text: path });
  },
};

export const example = parentCommand({
  name: "example", group: "author",
  summary: "List the example films and copy one into a workspace",
  usage: "vid2 example <ls|show|new|path> [options] [--json]",
  description: "Each example is the code and steps for one finished film (paper cutout, puppets, launch films, a keynote-style intro,\n"
    + "a generated clip). Media and renders live in its workspace, never in the package. For a blank start use vid2 init.",
  options: {}, subcommands: [lsSpec, showSpec, newSpec, pathSpec],
  examples: ["vid2 example ls", "vid2 example show claude-codex-dawn", 'cd "$(vid2 example new opus-astra-paper)"'],
});
