import { Vid2Error } from "../../shared/errors.ts";
import { commands } from "../registry.ts";
import type { CommandSpec } from "../registry.ts";
import { helpFor } from "../help/model.ts";
import { resolveCommand } from "../tree.ts";

export const help: CommandSpec = {
  name: "help",
  group: "agent",
  summary: "Show help for vid2, a command or a subcommand",
  usage: "vid2 help [command] [subcommand] [--json]",
  description: "Same text as --help. With --json, data.commands lists every command with its options, examples and subcommands.",
  examples: ["vid2 help", "vid2 help render", "vid2 help audio beats", "vid2 help --json"],
  options: {},
  run({ args }) {
    const node = args.length ? resolveCommand(args, commands, { help: true }) : { spec: help, path: [], parents: [] };
    const extra = "rest" in node ? node.rest.filter((a) => !a.startsWith("-")) : [];
    if (extra.length) return Promise.reject(new Vid2Error("E_INPUT", `unknown help topic: ${args.join(" ")}`, {
      details: { extra }, fix: `run vid2 help ${node.path.join(" ")}` }));
    return Promise.resolve({ command: "help", data: helpFor(node, commands) });
  },
};
