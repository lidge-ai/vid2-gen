#!/usr/bin/env node
// Turn pass-1 QA evidence into the scene-7 media: a 2x2 grid of the capture and compile seam stills, plus the waveform and spectrogram.
// Usage: node make-qa-media.mjs <pass1.qa dir> [media dir]
import { copyFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const qa = process.argv[2];
const media = process.argv[3] ?? fileURLToPath(new URL("./media/", import.meta.url));
if (!qa) { console.error("usage: node make-qa-media.mjs <pass1.qa dir> [media dir]"); process.exit(2); }
mkdirSync(media, { recursive: true });
const k = (name) => join(qa, "keyframes", name);
const inputs = ["capture-seam-before", "capture-seam-after", "compile-seam-before", "compile-seam-after"].flatMap((n) => ["-i", k(n + ".png")]);
const graph = "[0]scale=960:540[a];[1]scale=960:540[b];[2]scale=960:540[c];[3]scale=960:540[d];" +
  "[a][b][c][d]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0:fill=0x101318";
const res = spawnSync(process.env.VID2_FFMPEG ?? "ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", graph, join(media, "qa-seams.png")], { stdio: "inherit" });
if (res.status !== 0) process.exit(res.status ?? 1);
copyFileSync(join(qa, "waveform.png"), join(media, "qa-waveform.png"));
copyFileSync(join(qa, "spectrogram.png"), join(media, "qa-spectrogram.png"));
console.log("wrote qa-seams.png, qa-waveform.png, qa-spectrogram.png");
