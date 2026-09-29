import { Vid2Error } from "../../shared/errors.ts";
import { installSkills, listSkills, skillPath } from "../../skill/index.ts";
import type { SkillAgent } from "../../skill/index.ts";
import type { CommandSpec } from "../registry.ts";
import { parentCommand } from "../tree.ts";

const AGENTS = ["codex", "claude", "agents"];

const listSpec: CommandSpec = {
  name: "list", summary: "List the packaged skills",
  usage: "vid2 skill list [--json]", options: {}, examples: ["vid2 skill list --json"],
  run({ args }) {
    if (args.length) return Promise.reject(new Vid2Error("E_INPUT", "skill list takes no name"));
    return Promise.resolve({ command: "skill", data: { skills: listSkills() } });
  },
};

const pathSpec: CommandSpec = {
  name: "path", summary: "Print where a packaged skill lives",
  usage: "vid2 skill path [name] [--json]", options: {},
  examples: ["vid2 skill path", "vid2 skill path vid2-examples"],
  run({ args }) {
    if (args.length > 1) return Promise.reject(new Vid2Error("E_INPUT", "skill path takes at most one name"));
    return Promise.resolve({ command: "skill", data: { name: args[0] ?? "vid2", path: skillPath(args[0]) } });
  },
};

const installSpec: CommandSpec = {
  name: "install", summary: "Copy (or link) every packaged skill into an agent's skill directory",
  usage: "vid2 skill install [--agent codex|claude|agents | --dir <path> | --tmp] [--link] [--json]",
  options: {
    agent: { type: "string", value: "<codex|claude|agents>", description: "Install into that agent's default skill directory" },
    dir: { type: "string", value: "<path>", description: "Destination parent directory for the skills" },
    tmp: { type: "boolean", description: "Install under the system temporary directory" },
    link: { type: "boolean", description: "Symlink skill directories instead of copying" },
  },
  examples: ["vid2 skill install --agent codex", "vid2 skill install --dir ./.agents/skills --link"],
  run({ args, values, cwd }) {
    if (args.length) return Promise.reject(new Vid2Error("E_INPUT", "skill install takes no positional arguments"));
    const agent = values["agent"];
    if (agent !== undefined && (typeof agent !== "string" || !AGENTS.includes(agent))) {
      return Promise.reject(new Vid2Error("E_INPUT", "--agent must be codex, claude or agents"));
    }
    return Promise.resolve({ command: "skill", data: { ...installSkills({
      cwd,
      ...(typeof values["dir"] === "string" ? { dir: values["dir"] } : {}),
      ...(values["tmp"] === true ? { tmp: true } : {}),
      ...(agent ? { agent: agent as SkillAgent } : {}),
      ...(values["link"] === true ? { link: true } : {}),
    }) } });
  },
};

export const skill = parentCommand({
  name: "skill", group: "agent",
  summary: "List, locate or install packaged Agent Skills",
  usage: "vid2 skill [list|path|install] [options] [--json]",
  description: "Each skill is a SKILL.md with references/. After install the agent reads them from disk.",
  options: {}, subcommands: [listSpec, pathSpec, installSpec], defaultSubcommand: "list",
  examples: ["vid2 skill", "vid2 skill install --agent claude", "vid2 skill path vid2-direction"],
});
