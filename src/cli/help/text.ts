/** Text help in ima2-gen's layout: usage, grouped commands or subcommands, options, globals, environment, examples. */
import { packageVersion } from "../../shared/paths.ts";
import { ENVIRONMENT, GLOBAL_OPTIONS, GROUPS, ROOT_EXAMPLES, TOP_OPTIONS } from "../globals.ts";
import type { CommandOption, CommandSpec } from "../registry.ts";

const MAX_COLUMN = 36;

function table(rows: readonly (readonly [string, string])[]): string[] {
  const width = Math.min(MAX_COLUMN, Math.max(0, ...rows.map(([left]) => left.length)) + 2);
  return rows.map(([left, right]) => (left.length + 2 > width ? `${left}\n${" ".repeat(width + 4)}${right}` : left.padEnd(width) + right));
}

function flag(key: string, option: CommandOption): string {
  const value = option.type === "string" ? ` ${option.value ?? "<value>"}` : "";
  return `${option.short ? `-${option.short}, ` : "    "}--${key}${value}`;
}

function optionRows(options: Record<string, CommandOption>): [string, string][] {
  return Object.entries(options).map(([key, o]) => [flag(key, o),
    `${o.description}${o.default ? `. Default: ${o.default}` : ""}${o.multiple ? " (repeatable)" : ""}`]);
}

function section(title: string, lines: string[]): string[] {
  return lines.length ? ["", `  ${title}:`, ...lines.map((line) => `    ${line}`)] : [];
}

/** Positional placeholders from a synopsis ("vid2 probe <media> [--json]" -> "<media>"); "<sub>" for parents. depth = command words. */
export function argHint(spec: CommandSpec, depth = 1): string {
  if (spec.subcommands) return " <sub>";
  const words = spec.usage.split(/\s+/).slice(1 + depth);
  const hints = [];
  for (const word of words) {
    if (word === "[options]" || !/^<[^>]+>$|^\[[a-z][\w.-]*\]$/.test(word)) break;
    hints.push(word);
  }
  return hints.length ? ` ${hints.join(" ")}` : "";
}

function commandRows(specs: CommandSpec[], prefix: string): [string, string][] {
  const depth = prefix.trim() ? prefix.trim().split(" ").length + 1 : 1;
  return specs.map((s) => [`${s.name}${argHint(s, depth)}`, `${s.summary}${s.subcommands ? `  (vid2 ${prefix}${s.name} --help)` : ""}`]);
}

export function rootText(registry: Map<string, CommandSpec>): string {
  const specs = [...registry.values()];
  const lines = ["", `  vid2 ${packageVersion()} — the video CLI for coding agents, powered by ffmpeg`, "", "  Usage: vid2 <command> [options]"];
  for (const [group, title] of GROUPS) lines.push(...section(title, table(commandRows(specs.filter((s) => s.group === group), ""))));
  lines.push(...section("Other", table(commandRows(specs.filter((s) => !s.group), ""))));
  lines.push(...section("Global options", table(optionRows(TOP_OPTIONS))));
  lines.push(...section("Environment", table(ENVIRONMENT)));
  lines.push(...section("Examples", [...ROOT_EXAMPLES]));
  lines.push("", "  Run 'vid2 <command> --help' for its options, and 'vid2 help <command> <sub>' for a subcommand.", "");
  return lines.join("\n");
}

export function commandText(node: { spec: CommandSpec; path: string[]; parents: CommandSpec[] }): string {
  const { spec, path, parents } = node;
  const lines = ["", `  ${spec.usage}`, "", `  ${spec.summary}.`];
  if (spec.description) lines.push("", ...spec.description.split("\n").map((line) => `  ${line}`));
  if (spec.subcommands) {
    lines.push(...section("Subcommands", table(commandRows(spec.subcommands, `${path.join(" ")} `))));
    if (spec.defaultSubcommand) lines.push(`    With no subcommand, vid2 ${path.join(" ")} runs ${spec.defaultSubcommand}.`);
    lines.push(`    Run 'vid2 ${path.join(" ")} <sub> --help' for a subcommand's arguments and options.`);
  }
  lines.push(...section(spec.subcommands ? "Options shared by every subcommand" : "Options", table(optionRows(spec.options))));
  const inherited = Object.assign({}, ...parents.map((p) => p.options)) as Record<string, CommandOption>;
  lines.push(...section(`Options from vid2 ${path.slice(0, -1).join(" ")}`, table(optionRows(inherited))));
  lines.push(...section("Global options", table(optionRows(GLOBAL_OPTIONS))));
  lines.push(...section("Examples", spec.examples ?? []));
  lines.push("");
  return lines.join("\n");
}
