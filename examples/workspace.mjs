#!/usr/bin/env node
// Copies an example's sources from this repository into its workspace, $VID2_HOME/examples/<name> (default ~/.vid2/examples/<name>),
// and prints the workspace path. Media, captures, renders and generated timelines live only in the workspace and are never copied back.
// Usage: node examples/workspace.mjs <name>     sync one example and print its workspace
//        node examples/workspace.mjs --list     list the examples and whether a workspace exists
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** Workspace-only paths: generated media, captures, renders and scratch space. */
const WORKSPACE_ONLY = /(^|[\\/])(media|out|\.work|[^\\/]+\.vid2cap)([\\/]|$)|(^|[\\/])\.DS_Store$/;

export function workspaceRoot() {
  return join(process.env.VID2_HOME ?? join(homedir(), ".vid2"), "examples");
}

export function examples() {
  return readdirSync(here).filter((name) => statSync(join(here, name)).isDirectory()).sort();
}

/** Repository sources overwrite their workspace copies; everything else in the workspace is kept. */
export function syncWorkspace(name) {
  if (!examples().includes(name)) throw new Error(`unknown example "${name}"; run node examples/workspace.mjs --list`);
  const source = join(here, name), dest = join(workspaceRoot(), name);
  mkdirSync(dest, { recursive: true });
  cpSync(source, dest, { recursive: true, force: true, filter: (path) => !WORKSPACE_ONLY.test(relative(source, path)) });
  return dest;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = process.argv[2];
  if (!arg || arg === "--help") {
    console.error("usage: node examples/workspace.mjs <name> | --list");
    process.exit(arg ? 0 : 2);
  }
  if (arg === "--list") {
    for (const name of examples()) console.log(name + (existsSync(join(workspaceRoot(), name)) ? "  (workspace ready)" : ""));
  } else {
    console.log(syncWorkspace(arg));
  }
}
