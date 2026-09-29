#!/usr/bin/env node
// Runtime smoke: validates and renders a small timeline (text, shapes, a transition and a JS stage layer) with the runtime running this
// script, e.g. "bun scripts/runtime-smoke.mjs". With --compare-node it renders the same timeline with node and requires identical frames.
// Needs ffmpeg and a built dist/ (npm run build). Prints one JSON line; exits 1 on any failure.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(root, "bin", "vid2.js");
const dir = mkdtempSync(join(tmpdir(), "vid2-runtime-"));
const runtime = typeof globalThis.Bun === "object" ? "bun " + globalThis.Bun.version : "node " + process.version;

const pill = (key, x, fill) => ({ kind: "rect", key, width: 120, height: 48, radius: 24, x, y: 180, fill, shadow: { blur: 8, y: 4 } });
const timeline = {
  version: 1, output: { width: 640, height: 360, fps: 30 },
  scenes: [
    { id: "shapes", duration: "1s", background: "#0B0D12", transition: { type: "fade", duration: "0.3s" },
      layers: [{ type: "shape", shape: "rect", x: 170, y: 130, width: 300, height: 100, color: "#3355FF", radius: 24 },
        { type: "text", text: "vid2", size: 64, weight: "black", animation: "slam" }] },
    { id: "stage", duration: "1.2s", background: "#F5F5F2",
      layers: [{ type: "stage", nodes: [pill("a", 200, "#D97757"), pill("b", 440, "#23386A")],
        tracks: [
          { node: "a", prop: "scale", keys: [{ at: "0s", value: 0.2 }, { at: "0.3s", value: 1, ease: "spring", spring: { stiffness: 260, damping: 13 } }] },
          { node: "b", prop: "rotation", keys: [{ at: "0s", value: -30 }, { at: "0.8s", value: 0, ease: "out" }] },
          { node: "b", prop: "fill", keys: [{ at: "0s", value: "#23386A" }, { at: "1s", value: "#E9B44C" }] },
        ] }] },
  ],
};
writeFileSync(join(dir, "smoke.json"), JSON.stringify(timeline));

function vid2(exe, args, home) {
  const r = spawnSync(exe, [cli, ...args, "--json"], { cwd: dir, encoding: "utf8", env: { ...process.env, VID2_HOME: join(dir, home) } });
  const body = (() => { try { return JSON.parse(r.stdout); } catch { return null; } })();
  if (r.status !== 0 || !body?.ok) throw new Error(exe + " vid2 " + args[0] + " failed: " + (r.stdout || r.stderr).slice(0, 800));
  return body;
}

function frames(file) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", join(dir, file), "-map", "0:v", "-f", "md5", "-"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error("ffmpeg md5 failed: " + r.stderr);
  return r.stdout.trim();
}

try {
  vid2(process.execPath, ["validate", "smoke.json"], "home-a");
  const rendered = vid2(process.execPath, ["render", "smoke.json", "--profile", "proxy", "-o", "runtime.mp4"], "home-a");
  const result = { ok: true, runtime, frames: rendered.data.frames, seconds: rendered.data.seconds, md5: frames("runtime.mp4") };
  if (process.argv.includes("--compare-node")) {
    vid2("node", ["render", "smoke.json", "--profile", "proxy", "-o", "node.mp4"], "home-b");
    result.nodeMd5 = frames("node.mp4");
    if (result.nodeMd5 !== result.md5) throw new Error("frames differ from node: " + result.md5 + " vs " + result.nodeMd5);
  }
  console.log(JSON.stringify(result));
} catch (error) {
  console.log(JSON.stringify({ ok: false, runtime, error: String(error instanceof Error ? error.message : error) }));
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
