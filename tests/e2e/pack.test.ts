import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repo = fileURLToPath(new URL("../..", import.meta.url));

function command(bin: string, args: string[], cwd: string) {
  const result = spawnSync(bin, args, { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, `${bin} ${args.join(" ")} failed:\n${result.stderr}`);
  return result.stdout;
}

test("packed install runs outside the checkout", { skip: process.env["VID2_PACK_TEST"] !== "1" }, () => {
  const root = mkdtempSync(join(tmpdir(), "vid2-pack-"));
  const packed = JSON.parse(command("npm", ["pack", "--json", "--pack-destination", root], repo)) as { filename: string }[];
  const tarball = join(root, packed[0]!.filename);
  command("npm", ["install", "--prefix", root, "--ignore-scripts", tarball], root);
  // W4-05: the optional native input hook is never a package dependency.
  const installed = JSON.parse(readFileSync(join(root, "node_modules", "vid2-gen", "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) assert.equal(installed[field]?.["uiohook-napi"], undefined);
  const executable = join(root, "node_modules", ".bin", "vid2");
  const launcher = process.platform === "win32" ? process.execPath : executable;
  const args = process.platform === "win32"
    ? [join(root, "node_modules", "vid2-gen", "bin", "vid2.js"), "version", "--json"]
    : ["version", "--json"];
  const data = JSON.parse(command(launcher, args, root)) as { ok: boolean; data: Record<string, unknown> };
  assert.equal(data.ok, true);
  assert.equal(data.data["version"], (JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as { version: string }).version);

  // wp3 package contract: the installed CLI renders a 1 s timeline with bundled fonts, verified by ffprobe.
  const timeline = join(root, "smoke.json");
  writeFileSync(timeline, JSON.stringify({ version: 1, output: { width: 160, height: 90, fps: 15 },
    scenes: [{ id: "smoke", duration: "1s", layers: [{ type: "text", text: "vid2", size: 24 }] }] }));
  const out = join(root, "smoke.mp4");
  const renderArgs = ["render", timeline, "-o", out, "--profile", "final", "--json"];
  const rendered = JSON.parse(command(launcher, process.platform === "win32" ? [args[0]!, ...renderArgs] : renderArgs, root)) as { ok: boolean };
  assert.equal(rendered.ok, true);
  const frames = command("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames",
    "-of", "csv=p=0", out], root).trim();
  assert.equal(frames, "15");

  // wp7 package contract: skills and templates ship and work from the installed package.
  const run = (a: string[]) => JSON.parse(command(launcher, process.platform === "win32" ? [args[0]!, ...a] : a, root)) as { ok: boolean; data: Record<string, unknown> };
  const listed = run(["skill", "list", "--json"]);
  assert.equal(listed.ok, true);
  const skillsDir = join(root, "agent-skills");
  const skillInstall = run(["skill", "install", "--dir", skillsDir, "--json"]);
  assert.equal(skillInstall.ok, true);
  assert.ok(readFileSync(join(skillsDir, "vid2", "SKILL.md"), "utf8").includes("name: vid2"));
  const demo = join(root, "demo");
  assert.equal(run(["init", "feature-demo", demo, "--json"]).ok, true);
  assert.equal(run(["validate", join(demo, "timeline.json"), "--json"]).ok, true);

  // 030 package contract: the installed CLI lists the example films and copies one into a workspace.
  const examples = run(["example", "ls", "--json"]);
  assert.equal(examples.ok, true);
  assert.ok((examples.data["examples"] as unknown[]).length >= 6);
  const intro = join(root, "intro");
  const copied = run(["example", "new", "vid2-intro", "--dir", intro, "--json"]);
  assert.equal(copied.ok, true);
  assert.ok(readFileSync(join(intro, "build-timeline.mjs"), "utf8").length > 0);
});

/** npm on Windows is npm.cmd, which spawnSync can only start through a shell. */
function npm(args: string[], cwd: string): string {
  const result = spawnSync("npm", args, { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, shell: process.platform === "win32" });
  assert.equal(result.status, 0, `npm ${args.join(" ")} failed:\n${result.stderr}`);
  return result.stdout;
}

function packedPaths(cwd: string): string[] {
  const out = npm(["pack", "--dry-run", "--json", "--ignore-scripts"], cwd);
  return (JSON.parse(out.slice(out.indexOf("["))) as { files: { path: string }[] }[])[0]!.files.map((f) => f.path.replace(/\\/g, "/"));
}

// 030 R6/A5/A6: example sources ship, workspace media and the repo-only helper never do. Runs in a temp copy so the checkout is untouched.
test("the package ships example sources and no workspace media", () => {
  const dir = mkdtempSync(join(tmpdir(), "vid2-pack-examples-"));
  cpSync(join(repo, "package.json"), join(dir, "package.json"));
  cpSync(join(repo, "examples"), join(dir, "examples"), { recursive: true });
  const seeded = ["media/probe.bin", "out/x.mp4", ".work/y", "take.vid2cap/footage.mp4", ".DS_Store"].map((p) => `examples/opus-astra-paper/${p}`);
  for (const path of seeded) { mkdirSync(join(dir, path, ".."), { recursive: true }); writeFileSync(join(dir, path), "x"); }
  const packed = packedPaths(dir);
  for (const path of seeded) assert.equal(packed.includes(path), false, path);
  assert.equal(packed.includes("examples/workspace.mjs"), false);
  const manifests = readdirSync(join(repo, "examples"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `examples/${d.name}/example.json`);
  for (const manifest of manifests) assert.ok(packed.includes(manifest), manifest);
  const bytes = packed.filter((p) => p.startsWith("examples/")).reduce((sum, p) => sum + statSync(join(dir, p)).size, 0);
  assert.ok(bytes <= 600 * 1024, `example sources are ${bytes} bytes`);
});

test("every tracked example file except nested .gitignore files and workspace.mjs is packed", () => {
  const listed = spawnSync("git", ["ls-files", "examples"], { cwd: repo, encoding: "utf8" });
  if (listed.status !== 0) return; // a source tarball without git history has nothing to compare
  const tracked = listed.stdout.split("\n").filter((p) => p && !p.endsWith("/.gitignore") && p !== "examples/workspace.mjs");
  const packed = new Set(packedPaths(repo).filter((p) => p.startsWith("examples/")));
  for (const path of tracked) assert.ok(packed.has(path), path);
});
