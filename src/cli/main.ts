import { commandHint, parseOptions, wantsJson } from "./args.ts";
import { TOP_OPTIONS } from "./globals.ts";
import { helpFor } from "./help/model.ts";
import { renderFailure, renderSuccess } from "./output.ts";
import type { CommandResult } from "./output.ts";
import { commands } from "./registry.ts";
import { locate, optionsFor, settle } from "./tree.ts";

export interface CliIO {
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
  cwd?: string;
}

async function execute(argv: string[], cwd: string, stderr: NodeJS.WritableStream, track: (path: string, json: boolean) => void): Promise<CommandResult> {
  const found = locate(argv, commands);
  track(found.path.join(" "), wantsJson(argv));
  if (found.version) return commands.get("version")!.run({ args: [], values: {}, json: wantsJson(argv), cwd, stderr });
  const node = settle(found);
  const where = node.path.join(" ");
  track(where, wantsJson(argv));
  if (node.help) return { command: "help", data: helpFor(node, commands) };
  const parsed = parseOptions(node.rest, node.path.length ? optionsFor(node) : TOP_OPTIONS, where);
  const json = parsed.values["json"] === true || process.env["VID2_JSON"] === "1";
  track(where, json);
  return node.spec.run({ args: parsed.positionals, values: parsed.values, json, cwd, stderr });
}

export async function main(argv: string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  let command = "";
  let json = wantsJson(argv);
  try {
    const result = await execute(argv, io.cwd ?? process.cwd(), stderr, (path, asJson) => { command = path; json = asJson; });
    stdout.write(`${renderSuccess(result, json)}\n`);
    return 0;
  } catch (error) {
    const rendered = renderFailure(error, json, command || commandHint(argv));
    (json ? stdout : stderr).write(`${rendered.text}\n`);
    return rendered.exit;
  }
}
