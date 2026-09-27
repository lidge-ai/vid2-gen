import type { CommandResult } from "./output.ts";
import { doctor } from "./commands/doctor.ts";
import { schema } from "./commands/schema.ts";
import { validate } from "./commands/validate.ts";
import { resolve } from "./commands/resolve.ts";
import { version } from "./commands/version.ts";
import { help } from "./commands/help.ts";
import { compile } from "./commands/compile.ts";
import { render } from "./commands/render.ts";

export interface CommandOption {
  type: "string" | "boolean";
  short?: string;
  multiple?: boolean;
  description: string;
}

export interface CommandSpec {
  name: string;
  summary: string;
  usage: string;
  options: Record<string, CommandOption>;
  run(ctx: { args: string[]; values: Record<string, unknown>; json: boolean; cwd: string; stderr: NodeJS.WritableStream }): Promise<CommandResult>;
}

export const commands = new Map<string, CommandSpec>();

export function register(spec: CommandSpec): void {
  if (commands.has(spec.name)) throw new Error(`duplicate command: ${spec.name}`);
  commands.set(spec.name, spec);
}

for (const spec of [doctor, schema, validate, resolve, compile, render, version, help]) register(spec);
