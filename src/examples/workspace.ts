/** Example workspaces: sources copied from the package, media and renders kept in $VID2_HOME/examples/<name> (030). */
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { vid2Home } from "../shared/paths.ts";
import { examplesRoot, listExamples, unknownExample } from "./catalog.ts";

/** Workspace-only top-level folders (generated media, captures, renders, scratch) and Finder metadata anywhere. */
export const WORKSPACE_ONLY = /^(media|out|\.work|[^\\/]+\.vid2cap)([\\/]|$)|(^|[\\/])\.DS_Store$/;

export function workspaceRoot(): string {
  return join(vid2Home(), "examples");
}

export function workspaceFor(name: string): string {
  return join(workspaceRoot(), name);
}

function copied(source: string, dir = source): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    const rel = relative(source, path);
    if (WORKSPACE_ONLY.test(rel)) return [];
    return entry.isDirectory() ? copied(source, path) : [rel.split("\\").join("/")];
  }).sort();
}

/**
 * Copy an example's sources over their copies in dest (default: its workspace) and return dest and the copied files.
 * Media, captures, renders and scratch folders in dest are never touched.
 */
export function syncWorkspace(name: string, dest?: string, opts: { sourceRoot?: string } = {}): { path: string; source: string; files: string[] } {
  const root = opts.sourceRoot ?? examplesRoot();
  if (!listExamples(root).includes(name)) throw unknownExample(name, root);
  const source = join(root, name);
  const path = dest ?? workspaceFor(name);
  mkdirSync(path, { recursive: true });
  cpSync(source, path, { recursive: true, force: true, filter: (from) => !WORKSPACE_ONLY.test(relative(source, from)) });
  return { path, source, files: copied(source) };
}

export function workspaceReady(name: string): boolean {
  return existsSync(workspaceFor(name));
}
