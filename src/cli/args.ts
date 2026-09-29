import { parseArgs } from "node:util";
import { Vid2Error } from "../shared/errors.ts";
import type { CommandOption } from "./registry.ts";

export interface ParsedOptions {
  values: Record<string, unknown>;
  positionals: string[];
}

/** Strict parse of the argv left after the command words, over the options the resolved command accepts. */
export function parseOptions(args: string[], options: Record<string, CommandOption>, where: string): ParsedOptions {
  const config = Object.fromEntries(Object.entries(options).map(([key, o]) => [key, {
    type: o.type, ...(o.short ? { short: o.short } : {}), ...(o.multiple ? { multiple: true } : {}) }]));
  try {
    return parseArgs({ args, options: config, allowPositionals: true, strict: true });
  } catch (error) {
    throw new Vid2Error("E_INPUT", error instanceof Error ? error.message : "invalid arguments", {
      fix: `run vid2 ${where || "help"} --help`,
    });
  }
}

export function wantsJson(argv: string[]): boolean {
  return argv.includes("--json") || process.env["VID2_JSON"] === "1";
}

export function commandHint(argv: string[]): string {
  return argv.find((arg) => !arg.startsWith("-")) ?? "help";
}
