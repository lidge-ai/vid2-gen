#!/usr/bin/env node
// Repository helper: copies an example's sources into its workspace, $VID2_HOME/examples/<name> (default ~/.vid2/examples/<name>),
// and prints the workspace path. An installed vid2 does the same with `vid2 example new <name>`; both share src/examples.
// Usage: node examples/workspace.mjs <name>     sync one example and print its workspace
//        node examples/workspace.mjs --list     list the examples and whether a workspace exists
import { listExamples, syncWorkspace, workspaceReady } from "../src/examples/index.ts";

const arg = process.argv[2];
if (!arg || arg === "--help") {
  console.error("usage: node examples/workspace.mjs <name> | --list");
  process.exit(arg ? 0 : 2);
}
try {
  if (arg === "--list") {
    for (const name of listExamples()) console.log(name + (workspaceReady(name) ? "  (workspace ready)" : ""));
  } else {
    console.log(syncWorkspace(arg).path);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
