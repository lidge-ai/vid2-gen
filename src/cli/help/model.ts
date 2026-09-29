/** JSON help data (020 JSON help): old fields kept, tree fields added. */
import { ENVIRONMENT, GLOBAL_OPTIONS, TOP_OPTIONS } from "../globals.ts";
import type { CommandOption, CommandSpec } from "../registry.ts";
import { commandText, rootText } from "./text.ts";

export interface SpecData {
  name: string;
  path: string;
  summary: string;
  usage: string;
  options: Record<string, CommandOption>;
  group?: string;
  description?: string;
  examples: string[];
  subcommands: SpecData[];
  defaultSubcommand?: string;
}

export function specData(spec: CommandSpec, path: string[]): SpecData {
  return {
    name: spec.name, path: path.join(" "), summary: spec.summary, usage: spec.usage, options: spec.options,
    ...(spec.group ? { group: spec.group } : {}), ...(spec.description ? { description: spec.description } : {}),
    examples: spec.examples ?? [],
    subcommands: (spec.subcommands ?? []).map((sub) => specData(sub, [...path, sub.name])),
    ...(spec.defaultSubcommand ? { defaultSubcommand: spec.defaultSubcommand } : {}),
  };
}

export function helpFor(node: { spec: CommandSpec; path: string[]; parents: CommandSpec[] }, registry: Map<string, CommandSpec>): Record<string, unknown> {
  if (!node.path.length) return {
    usage: rootText(registry),
    commands: [...registry.values()].map((spec) => specData(spec, [spec.name])),
    globalOptions: TOP_OPTIONS,
    environment: ENVIRONMENT.map(([name, description]) => ({ name, description })),
  };
  const own = specData(node.spec, node.path);
  const inherited = Object.assign({}, ...node.parents.map((p) => p.options)) as Record<string, CommandOption>;
  return {
    usage: commandText(node), command: own.path, options: { ...inherited, ...node.spec.options },
    summary: own.summary, synopsis: node.spec.usage, ...(own.description ? { description: own.description } : {}),
    examples: own.examples, subcommands: own.subcommands, ...(own.defaultSubcommand ? { defaultSubcommand: own.defaultSubcommand } : {}),
    globalOptions: GLOBAL_OPTIONS, commands: [own],
  };
}
