import { Vid2Error } from "../../shared/errors.ts";
import { installSkills, listSkills, skillPath } from "../../skill/index.ts";
import type { SkillAgent } from "../../skill/index.ts";
import type { CommandSpec } from "../registry.ts";

const AGENTS = ["codex", "claude", "agents"];
export const skill: CommandSpec = {
  name: "skill",
  summary: "List, locate or install packaged Agent Skills",
  usage: "vid2 skill <list | path [name] | install [--dir <path> | --tmp | --agent codex|claude|agents] [--link]> [--json]",
  options: {
    dir: { type: "string", description: "Destination parent directory for installed skills" },
    tmp: { type: "boolean", description: "Install under the system temporary directory" },
    agent: { type: "string", description: "Default skill directory: codex, claude or agents" },
    link: { type: "boolean", description: "Symlink skill directories instead of copying" },
  },
  run({ args, values, cwd }) {
    const [action, name] = args;
    if (!action || action === "list") {
      if (args.length > 1) throw new Vid2Error("E_INPUT", "skill list takes no name");
      return Promise.resolve({ command: "skill", data: { skills: listSkills() } });
    }
    if (action === "path") {
      if (args.length > 2) throw new Vid2Error("E_INPUT", "skill path takes at most one name");
      return Promise.resolve({ command: "skill", data: { name: name ?? "vid2", path: skillPath(name) } });
    }
    if (action !== "install" || args.length > 1) throw new Vid2Error("E_INPUT", `unknown skill action: ${args.join(" ")}`);
    const agent = values["agent"];
    if (agent !== undefined && (typeof agent !== "string" || !AGENTS.includes(agent))) {
      throw new Vid2Error("E_INPUT", "--agent must be codex, claude or agents");
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
