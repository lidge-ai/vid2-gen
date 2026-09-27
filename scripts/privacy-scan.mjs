#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const homePath = new RegExp(`[\\/](?:Users|home)[\\/][^\\/\\s]+[\\/]`, "g");
const windowsHome = new RegExp(`[A-Za-z]:\\\\Users\\\\[^\\\\\\s]+\\\\`, "g");
const email = new RegExp(`[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}`, "gi");
const tokens = [
  ["GitHub token", new RegExp(`gh[opsu]_${"[A-Za-z0-9]{30,}"}`, "g")],
  ["GitHub PAT", new RegExp(`github_pat_${"[A-Za-z0-9_]{40,}"}`, "g")],
  ["npm token", new RegExp(`npm_${"[A-Za-z0-9]{30,}"}`, "g")],
  ["API token", new RegExp(`sk-${"[A-Za-z0-9_-]{32,}"}`, "g")],
  ["API key value", new RegExp(`api-key["':= ]+${"[A-Za-z0-9]{24,}"}`, "gi")],
];

function git(args, cwd, encoding = "utf8") {
  const result = spawnSync("git", args, { cwd, encoding, maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.stderr?.toString() || result.error?.message || `git ${args[0]} failed`);
  return result.stdout;
}

function refs(cwd, range) {
  if (range) {
    const lines = git(["rev-list", "--objects", range], cwd).trim().split("\n").filter(Boolean);
    return lines.flatMap((line) => {
      const space = line.indexOf(" ");
      if (space < 0) return [];
      const oid = line.slice(0, space);
      return git(["cat-file", "-t", oid], cwd).trim() === "blob"
        ? [{ oid, path: line.slice(space + 1) }]
        : [];
    });
  }
  const tree = git(["ls-tree", "-r", "-z", "HEAD"], cwd);
  return tree.split("\0").filter(Boolean).flatMap((record) => {
    const match = /^\d+ blob ([0-9a-f]+)\t(.+)$/s.exec(record);
    return match ? [{ oid: match[1], path: match[2] }] : [];
  });
}

export function scanText(value, path) {
  if (value.includes("\0")) return [];
  const findings = [];
  const lines = value.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line) continue;
    if (homePath.test(line) || windowsHome.test(line)) findings.push(`${path}:${index + 1}: absolute home path`);
    homePath.lastIndex = 0;
    windowsHome.lastIndex = 0;
    for (const match of line.matchAll(email)) {
      const address = match[0].toLowerCase();
      if (!address.endsWith("@users.noreply.github.com") && address !== "security@lidge.ai") {
        findings.push(`${path}:${index + 1}: personal email`);
      }
    }
    for (const [label, pattern] of tokens) {
      if (pattern.test(line)) findings.push(`${path}:${index + 1}: ${label}`);
      pattern.lastIndex = 0;
    }
  }
  return findings;
}

function options(args) {
  let range;
  let paths;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--range" && args[i + 1]) range = args[++i];
    else if (args[i] === "--paths" && args[i + 1]) paths = args[++i].split(",");
    else throw new Error(`Unknown or incomplete option: ${args[i]}`);
  }
  if (range && paths) throw new Error("--range and --paths cannot be combined");
  return { range, paths };
}

function main() {
  const cwd = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const { range, paths } = options(process.argv.slice(2));
  const sources = paths
    ? paths.map((path) => ({ path, content: readFileSync(resolve(path)) }))
    : refs(cwd, range).map(({ oid, path }) => ({ path, content: git(["cat-file", "blob", oid], cwd, null) }));
  const findings = sources.flatMap(({ path, content }) => scanText(content.toString("utf8"), path));
  for (const finding of findings) console.error(finding);
  if (findings.length) process.exitCode = 1;
  else console.log(`privacy scan: ${sources.length} files clean`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`privacy scan: ${error.message}`); process.exitCode = 1; }
}
