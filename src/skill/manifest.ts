import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Vid2Error } from "../shared/errors.ts";

export interface SkillManifestEntry { files: Record<string, string>; sha256: string }
export type SkillManifest = Record<string, SkillManifestEntry>;
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const SKILLS_ROOT = join(PACKAGE_ROOT, "skills");

export function sha256(content: Buffer | string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function loadSkillManifest(): SkillManifest {
  try {
    const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, "skills-manifest.json"), "utf8")) as SkillManifest;
    if (Object.keys(manifest).length === 0) throw new Error("empty manifest");
    return manifest;
  } catch (error) {
    throw new Vid2Error("E_NOT_FOUND", "packaged skills manifest is unavailable", {
      fix: "run node scripts/skills-manifest.mjs from a source checkout, or reinstall the vid2 package",
      cause: error,
    });
  }
}

export function skillPath(name = "vid2"): string {
  const manifest = loadSkillManifest();
  if (!Object.hasOwn(manifest, name)) throw new Vid2Error("E_INPUT", `unknown skill: ${name}`, {
    details: { names: Object.keys(manifest) }, fix: "run vid2 skill list",
  });
  return join(SKILLS_ROOT, name, "SKILL.md");
}

export function listSkills(): { name: string; path: string; description: string; sha256: string }[] {
  const manifest = loadSkillManifest();
  return Object.entries(manifest).map(([name, entry]) => {
    const path = skillPath(name);
    const source = readFileSync(path, "utf8");
    const description = source.match(/^description:\s*(.+)$/m)?.[1]?.replace(/^['"]|['"]$/g, "") ?? "";
    return { name, path, description, sha256: entry.sha256 };
  });
}
