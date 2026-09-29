import type { CommandResult } from "./output.ts";
import { doctor } from "./commands/doctor.ts";
import { schema } from "./commands/schema.ts";
import { validate } from "./commands/validate.ts";
import { resolve } from "./commands/resolve.ts";
import { version } from "./commands/version.ts";
import { help } from "./commands/help.ts";
import { compile } from "./commands/compile.ts";
import { render } from "./commands/render.ts";
import { capture } from "./commands/capture.ts";
import { audio } from "./commands/audio.ts";
import { assets } from "./commands/assets.ts";
import { qa } from "./commands/qa.ts";
import { analyze } from "./commands/analyze.ts";
import { review } from "./commands/review.ts";
import { probe } from "./commands/probe.ts";
import { preview } from "./commands/preview.ts";
import { skill } from "./commands/skill.ts";
import { init } from "./commands/init.ts";
import { example } from "./commands/example.ts";
import { capabilities } from "./commands/capabilities.ts";

export interface CommandOption {
  type: "string" | "boolean";
  short?: string;
  multiple?: boolean;
  description: string;
  /** Placeholder shown after the flag in help, e.g. "<file>" or "<proxy|final>". */
  value?: string;
  /** Default shown in help as "Default: ...". */
  default?: string;
}

/** Top-level help sections, in display order (src/cli/globals.ts GROUPS). */
export type CommandGroup = "author" | "render" | "media" | "review" | "agent";

export interface RunContext {
  args: string[];
  values: Record<string, unknown>;
  json: boolean;
  cwd: string;
  stderr: NodeJS.WritableStream;
}

export interface CommandSpec {
  /** Word typed on the command line: "render" or, for a subcommand, "beats". */
  name: string;
  summary: string;
  /** One-line synopsis, e.g. "vid2 audio beats <file> [--json]". */
  usage: string;
  group?: CommandGroup;
  description?: string;
  examples?: string[];
  /** Own options; on a parent command these are shared by every subcommand. */
  options: Record<string, CommandOption>;
  subcommands?: CommandSpec[];
  /** Subcommand run when the parent is called with no positional word ("list" for skill). */
  defaultSubcommand?: string;
  run(ctx: RunContext): Promise<CommandResult>;
}

export const commands = new Map<string, CommandSpec>();

export function register(spec: CommandSpec): void {
  if (commands.has(spec.name)) throw new Error(`duplicate command: ${spec.name}`);
  const subs = (spec.subcommands ?? []).map((sub) => sub.name);
  if (new Set(subs).size !== subs.length) throw new Error(`duplicate subcommand under ${spec.name}`);
  if (spec.defaultSubcommand && !subs.includes(spec.defaultSubcommand)) throw new Error(`unknown default subcommand for ${spec.name}`);
  commands.set(spec.name, spec);
}

for (const spec of [init, example, schema, validate, resolve, compile, render, preview, capture, audio, assets, probe, qa, analyze, review, doctor, capabilities, skill, version, help]) register(spec);
