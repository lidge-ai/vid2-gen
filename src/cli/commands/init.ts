import { cp, mkdir, readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { packageRoot } from "../../shared/paths.ts";
import { Vid2Error } from "../../shared/errors.ts";
import type { CommandSpec } from "../registry.ts";

const NAMES = ["launch-teaser", "feature-demo", "changelog", "social-vertical", "kinetic-launch"] as const;
export type TemplateName = (typeof NAMES)[number];

export function listTemplates(): TemplateName[] { return [...NAMES]; }

export async function initTemplate(name: string, dir: string, force = false): Promise<string[]> {
  if (!NAMES.includes(name as TemplateName)) throw new Vid2Error("E_INPUT", `unknown template: ${name}`, {
    details: { templates: NAMES }, fix: "run vid2 init --list" });
  const source = join(packageRoot(), "templates", name);
  try { if (!(await stat(source)).isDirectory()) throw new Error("not a directory"); }
  catch { throw new Vid2Error("E_INTERNAL", `template files missing: ${name}`); }
  await mkdir(dir, { recursive: true });
  const existing = await readdir(dir);
  if (existing.length && !force) throw new Vid2Error("E_INPUT", `destination is not empty: ${dir}`, {
    fix: "choose an empty directory or pass --force" });
  await cp(source, dir, { recursive: true, force: true });
  return (await readdir(source)).sort();
}

export const init: CommandSpec = {
  name: "init", group: "author",
  examples: ["vid2 init --list","vid2 init launch-teaser my-video","vid2 init feature-demo demo --force"],
  summary: "Copy a ready-to-edit video timeline template",
  usage: "vid2 init <template> [dir] [--force] [--json] | vid2 init --list",
  description: `Templates: ${NAMES.join(", ")}. The directory defaults to the template name.`,
  options: {
    list: { type: "boolean", description: "List available templates" },
    force: { type: "boolean", description: "Copy into a non-empty destination and replace conflicting files" },
  },
  async run({ args, values, cwd }) {
    if (values["list"] === true) {
      if (args.length) throw new Vid2Error("E_INPUT", "--list takes no template or directory");
      return { command: "init", data: { templates: listTemplates() } };
    }
    if (!args[0] || args.length > 2) throw new Vid2Error("E_INPUT", "init needs a template and optional directory", {
      details: { templates: NAMES }, fix: "run vid2 init --list" });
    const dir = resolve(cwd, args[1] ?? basename(args[0]));
    const files = await initTemplate(args[0], dir, values["force"] === true);
    return { command: "init", data: { template: args[0], directory: dir, files }, artifacts: [join(dir, "timeline.json")] };
  },
};
