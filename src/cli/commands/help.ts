import { Vid2Error } from "../../shared/errors.ts";
import { commands } from "../registry.ts";
import type { CommandSpec } from "../registry.ts";

function usageFor(name?: string): string {
  if (name) return commands.get(name)?.usage ?? "";
  return `vid2 <command> [options]\n\nCommands:\n${[...commands.values()]
    .map((command) => `  ${command.name.padEnd(10)} ${command.summary}`)
    .join("\n")}\n\nRun vid2 help <command> for command usage.`;
}

export const help: CommandSpec = {
  name: "help",
  summary: "List commands and options",
  usage: "vid2 help [command] [--json]",
  options: {},
  run({ args }) {
    if (args.length > 1 || (args[0] && !commands.has(args[0]))) {
      throw new Vid2Error("E_INPUT", `unknown help topic: ${args.join(" ")}`, { details: { commands: [...commands.keys()] } });
    }
    const command = args[0];
    const selected = command ? [commands.get(command)!] : [...commands.values()];
    return Promise.resolve({
      command: "help",
      data: {
        usage: usageFor(command),
        commands: selected.map(({ name, summary, usage, options }) => ({ name, summary, usage, options })),
      },
    });
  },
};
