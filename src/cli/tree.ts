/** Command tree: locate the deepest spec in argv, apply subcommand rules, merge inherited options (020). */
import { parseArgs } from "node:util";
import { Vid2Error } from "../shared/errors.ts";
import { GLOBAL_OPTIONS } from "./globals.ts";
import type { CommandOption, CommandSpec, RunContext } from "./registry.ts";
import type { CommandResult } from "./output.ts";

export interface Located {
  spec: CommandSpec;
  /** Command words, e.g. ["audio", "beats"]; empty for bare "vid2". */
  path: string[];
  parents: CommandSpec[];
  /** argv without the consumed command words. */
  rest: string[];
  help: boolean;
  version: boolean;
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = row[j]!;
      row[j] = next;
    }
  }
  return row[b.length]!;
}

/** Closest name within edit distance 2, if any. */
export function suggest(word: string, names: readonly string[]): string | undefined {
  let best: { name: string; d: number } | undefined;
  for (const name of names) {
    const d = distance(word, name);
    if (d <= 2 && (!best || d < best.d)) best = { name, d };
  }
  return best?.name;
}

const isFlag = (arg: string): boolean => arg.startsWith("-") && arg !== "-";

function unknownCommand(word: string, registry: Map<string, CommandSpec>): Vid2Error {
  const names = [...registry.keys()];
  const hint = suggest(word, names);
  return new Vid2Error("E_INPUT", `unknown command: ${word}`, {
    details: { command: word, commands: names, ...(hint ? { suggestion: hint } : {}) },
    fix: hint ? `did you mean vid2 ${hint}? Run vid2 help` : "run vid2 help" });
}

/** Find the command and descend while the next argv word names a subcommand. Throws only for an unknown top-level word. */
export function locate(argv: string[], registry: Map<string, CommandSpec>, opts: { help?: boolean } = {}): Located {
  const end = argv.indexOf("--");
  const head = end < 0 ? argv : argv.slice(0, end);
  const help = opts.help === true || head.some((a) => a === "-h" || a === "--help");
  const first = head.findIndex((a) => !isFlag(a));
  if (first < 0) {
    if (end >= 0 && end + 1 < argv.length) throw new Vid2Error("E_INPUT", "put the command before --", {
      details: { argv }, fix: `vid2 ${argv[end + 1]} ... -- ...` });
    const version = !help && head.some((a) => a === "-v" || a === "--version");
    return { spec: registry.get(version ? "version" : "help")!, path: [], parents: [], rest: argv, help, version };
  }
  let spec = registry.get(argv[first]!);
  if (!spec) throw unknownCommand(argv[first]!, registry);
  const consumed = new Set([first]);
  const path = [spec.name];
  const parents: CommandSpec[] = [];
  for (let i = first + 1; spec.subcommands && i < head.length; i++) {
    const sub: CommandSpec | undefined = spec.subcommands.find((s) => s.name === argv[i]);
    if (!sub) break;
    parents.push(spec);
    spec = sub;
    path.push(sub.name);
    consumed.add(i);
  }
  return { spec, path, parents, rest: argv.filter((_, i) => !consumed.has(i)), help, version: false };
}

/** Own options plus every parent's, plus the global ones; a key defined twice is a programming error. */
export function optionsFor(node: Pick<Located, "spec" | "parents">): Record<string, CommandOption> {
  const merged: Record<string, CommandOption> = { ...GLOBAL_OPTIONS };
  const shorts = new Set(Object.values(GLOBAL_OPTIONS).flatMap((o) => (o.short ? [o.short] : [])));
  for (const level of [...node.parents, node.spec]) {
    for (const [key, option] of Object.entries(level.options)) {
      if (Object.hasOwn(merged, key)) throw new Vid2Error("E_INTERNAL", `option --${key} is defined twice on the path to ${node.spec.name}`);
      if (option.short && shorts.has(option.short)) throw new Vid2Error("E_INTERNAL", `short option -${option.short} is defined twice on the path to ${node.spec.name}`);
      if (option.short) shorts.add(option.short);
      merged[key] = option;
    }
  }
  return merged;
}

function scanConfig(node: Pick<Located, "spec" | "parents">): Record<string, { type: "string" | "boolean"; short?: string; multiple?: boolean }> {
  const all: Record<string, CommandOption> = { ...optionsFor(node) };
  for (const sub of node.spec.subcommands ?? []) for (const [key, option] of Object.entries(sub.options)) all[key] ??= option;
  return Object.fromEntries(Object.entries(all).map(([key, o]) => [key, {
    type: o.type, ...(o.short ? { short: o.short } : {}), ...(o.multiple ? { multiple: true } : {}) }]));
}

function needsSubcommand(where: string, names: string[]): Vid2Error {
  return new Vid2Error("E_INPUT", `${where} needs a subcommand: ${names.join(" | ")}`, {
    details: { subcommands: names }, fix: `run vid2 ${where} --help` });
}

function unknownSubcommand(where: string, word: string, names: string[]): Vid2Error {
  const hint = suggest(word, names);
  return new Vid2Error("E_INPUT", `unknown subcommand: ${where} ${word}`, {
    details: { subcommands: names, ...(hint ? { suggestion: hint } : {}) },
    fix: hint ? `did you mean vid2 ${where} ${hint}?` : `run vid2 ${where} --help` });
}

/**
 * Apply the subcommand rules to a parent that locate() stopped at: help shows the parent, no word runs the default or
 * asks for a subcommand, a subcommand word in the wrong place must move, any other word is unknown (020 A2, A14).
 */
export function settle(loc: Located): Located {
  const { spec } = loc;
  if (!spec.subcommands) return loc;
  const names = spec.subcommands.map((s) => s.name);
  const where = loc.path.join(" ");
  const { positionals } = parseArgs({ args: loc.rest, options: scanConfig(loc), strict: false, allowPositionals: true });
  if (!positionals.length) {
    if (loc.help) return loc;
    const fallback = spec.subcommands.find((s) => s.name === spec.defaultSubcommand);
    if (!fallback) throw needsSubcommand(where, names);
    return { ...loc, spec: fallback, parents: [...loc.parents, spec], path: [...loc.path, fallback.name] };
  }
  const misplaced = positionals.find((word) => names.includes(word));
  const target = misplaced === undefined ? undefined : spec.subcommands.find((s) => s.name === misplaced);
  if (target && loc.help) return { ...loc, spec: target, parents: [...loc.parents, spec], path: [...loc.path, target.name] };
  if (misplaced) throw new Vid2Error("E_INPUT", `${misplaced} must directly follow vid2 ${where}`, {
    details: { subcommands: names }, fix: `vid2 ${where} ${misplaced} [options]` });
  throw unknownSubcommand(where, positionals[0]!, names);
}

/** locate() + settle(): the spec a command line (or "vid2 help <path>") refers to. */
export function resolveCommand(argv: string[], registry: Map<string, CommandSpec>, opts: { help?: boolean } = {}): Located {
  return settle(locate(argv, registry, opts));
}

/** Direct callers (tests, scripts) may run a parent; forward args[0] to its subcommand without re-parsing options. */
export function dispatchSubcommand(parent: CommandSpec, ctx: RunContext): Promise<CommandResult> {
  const subs = parent.subcommands ?? [];
  const names = subs.map((s) => s.name);
  const [word, ...rest] = ctx.args;
  const target = word ?? parent.defaultSubcommand;
  const sub = subs.find((s) => s.name === target);
  if (!sub) return Promise.reject(word === undefined ? needsSubcommand(parent.name, names) : unknownSubcommand(parent.name, word, names));
  return sub.run({ ...ctx, args: word === undefined ? [] : rest });
}

/** A parent command whose run dispatches to its subcommands. */
export function parentCommand(spec: Omit<CommandSpec, "run">): CommandSpec {
  const parent: CommandSpec = { ...spec, run: (ctx) => dispatchSubcommand(parent, ctx) };
  return parent;
}
