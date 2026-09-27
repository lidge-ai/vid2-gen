import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Vid2Error } from "../shared/errors.ts";
import { loadSkillManifest, sha256, SKILLS_ROOT } from "./manifest.ts";

export type SkillAgent = "codex" | "claude" | "agents";
export interface InstallOptions { dir?: string; tmp?: boolean; agent?: SkillAgent; link?: boolean; cwd?: string }
export interface InstallResult { target: string; installed: string[]; changed: string[]; unchanged: string[]; changedCount: number }

export function installTarget(opts: InstallOptions): string {
  if (opts.dir && (opts.tmp || opts.agent)) throw new Vid2Error("E_INPUT", "choose one of --dir, --tmp, or --agent");
  if (opts.tmp && opts.agent) throw new Vid2Error("E_INPUT", "choose one of --tmp or --agent");
  if (opts.dir) return resolve(opts.cwd ?? process.cwd(), opts.dir);
  if (opts.tmp) return join(tmpdir(), "vid2-skills");
  if (opts.agent === "claude") return join(homedir(), ".claude", "skills");
  if (opts.agent === "agents") return join(opts.cwd ?? process.cwd(), ".agents", "skills");
  return join(homedir(), ".codex", "skills");
}

function replaceFile(source: string, dest: string, digest: string, changed: string[], unchanged: string[]): void {
  if (lstatSafe(dest)?.isSymbolicLink()) throw new Vid2Error("E_INPUT", `skill file path is a symlink: ${dest}`);
  if (existsSync(dest) && lstatSync(dest).isFile() && sha256(readFileSync(dest)) === digest) {
    unchanged.push(dest); return;
  }
  if (existsSync(dest) && lstatSync(dest).isDirectory()) throw new Vid2Error("E_INPUT", `skill file path is a directory: ${dest}`);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(source, dest);
  changed.push(dest);
}

export function installSkills(opts: InstallOptions = {}): InstallResult {
  const target = installTarget(opts);
  const manifest = loadSkillManifest();
  const changed: string[] = [], unchanged: string[] = [], installed: string[] = [];
  mkdirSync(target, { recursive: true });
  for (const [name, entry] of Object.entries(manifest)) {
    const sourceDir = join(SKILLS_ROOT, name), destDir = join(target, name);
    installed.push(destDir);
    if (opts.link) {
      if (existsSync(destDir) || lstatSafe(destDir)) {
        if (lstatSafe(destDir)?.isSymbolicLink() && readlinkSync(destDir) === sourceDir) { unchanged.push(destDir); continue; }
        throw new Vid2Error("E_INPUT", `cannot link over existing skill: ${destDir}`, { fix: "use copy mode or choose an empty --dir" });
      }
      symlinkSync(sourceDir, destDir, "dir"); changed.push(destDir); continue;
    }
    if (lstatSafe(destDir)?.isSymbolicLink()) {
      if (readlinkSync(destDir) !== sourceDir) throw new Vid2Error("E_INPUT", `skill path is a foreign symlink: ${destDir}`);
      unlinkSync(destDir);
    }
    for (const [relative, digest] of Object.entries(entry.files)) {
      const source = join(sourceDir, relative), dest = join(destDir, relative);
      if (!existsSync(source) || sha256(readFileSync(source)) !== digest) {
        throw new Vid2Error("E_INTERNAL", `packaged skill hash mismatch: ${name}/${relative}`);
      }
      replaceFile(source, dest, digest, changed, unchanged);
    }
  }
  return { target, installed, changed, unchanged, changedCount: changed.length };
}

function lstatSafe(path: string): ReturnType<typeof lstatSync> | undefined {
  try { return lstatSync(path); } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
