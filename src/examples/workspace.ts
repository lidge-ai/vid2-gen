/** Example workspaces: sources copied from the package, media and renders kept in $VID2_HOME/examples/<name> (030). */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Vid2Error } from "../shared/errors.ts";
import { vid2Home } from "../shared/paths.ts";
import { examplesRoot, listExamples, unknownExample } from "./catalog.ts";
import { MANIFEST_FILE } from "./manifest.ts";

/** Workspace-only top-level folders (generated media, captures, renders, scratch) and Finder metadata anywhere. */
export const WORKSPACE_ONLY = /^(media|out|\.work|[^\\/]+\.vid2cap)([\\/]|$)|(^|[\\/])\.DS_Store$/;

export function workspaceRoot(): string {
  return join(vid2Home(), "examples");
}

export function workspaceFor(name: string): string {
  return join(workspaceRoot(), name);
}

export function workspaceReady(name: string): boolean {
  return existsSync(workspaceFor(name));
}

/** Source files an example ships, relative with "/" separators, sorted; workspace-only paths excluded. */
export function sourceFiles(source: string, dir = source): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    const rel = relative(source, path);
    if (WORKSPACE_ONLY.test(rel)) return [];
    return entry.isDirectory() ? sourceFiles(source, path) : [rel.split("\\").join("/")];
  }).sort();
}

function isWorkspaceOf(path: string, name: string): boolean {
  try { return (JSON.parse(readFileSync(join(path, MANIFEST_FILE), "utf8")) as { name?: unknown }).name === name; }
  catch { return false; }
}

/** Refuse a destination inside the packaged source, a file, or a non-empty folder that is not this example's workspace (unless forced). */
function guardDestination(path: string, source: string, name: string, force: boolean): void {
  const inside = relative(source, path);
  if (inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))) throw new Vid2Error("E_INPUT",
    `the destination is inside the example's packaged source: ${path}`, { fix: `omit --dir to use ${workspaceFor(name)}` });
  if (!existsSync(path)) return;
  if (!statSync(path).isDirectory()) throw new Vid2Error("E_INPUT", `the destination is a file: ${path}`, { fix: "choose a directory" });
  if (force || isWorkspaceOf(path, name)) return;
  if (readdirSync(path).some((entry) => entry !== ".DS_Store")) throw new Vid2Error("E_INPUT",
    `the destination is not empty and is not a ${name} workspace: ${path}`, { fix: "choose an empty directory, or pass --force to copy into it" });
}

export interface SyncResult {
  path: string;
  source: string;
  /** Every source file of the example. */
  files: string[];
  /** Files written this time. */
  copied: string[];
  /** Files that already existed and were kept (pass force to overwrite them). */
  skipped: string[];
}

/**
 * Copy an example's sources into dest (default: its workspace). Existing files are kept unless force is set, so edits survive a
 * re-run; media/, out/, .work/ and *.vid2cap/ are never copied or touched.
 */
export function syncWorkspace(name: string, dest?: string, opts: { sourceRoot?: string; force?: boolean } = {}): SyncResult {
  const root = opts.sourceRoot ?? examplesRoot();
  if (!listExamples(root).includes(name)) throw unknownExample(name, root);
  const source = join(root, name);
  const path = resolve(dest ?? workspaceFor(name));
  const force = opts.force === true;
  guardDestination(path, source, name, force);
  const files = sourceFiles(source);
  const copied: string[] = [], skipped: string[] = [];
  for (const rel of files) {
    const to = join(path, rel);
    if (!force && existsSync(to)) { skipped.push(rel); continue; }
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(source, rel), to);
    copied.push(rel);
  }
  return { path, source, files, copied, skipped };
}
