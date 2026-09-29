// Prepares local media for "Claude & Codex at dawn": logo cutouts with paper shadows, Korean fonts and a paper-fibre overlay.
// Usage: CLAUDE_SVG=<claude spark svg> CODEX_PNG=<Codex app icon png> FONT_DIR=<dir with KoPubWorld Batang and Dotum TTFs> node prepare-assets.mjs
// Everything is written to media/ (ignored by git); logos and fonts stay with their owners and are never committed.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("./media/", import.meta.url));
const CLAUDE_SVG = process.env.CLAUDE_SVG, CODEX_PNG = process.env.CODEX_PNG ?? "/Applications/ChatGPT.app/Contents/Resources/icon-codex-light.png";
const FONT_DIR = process.env.FONT_DIR;
if (!CLAUDE_SVG || !FONT_DIR) { console.error("set CLAUDE_SVG and FONT_DIR"); process.exit(2); }
mkdirSync(join(OUT, "fonts"), { recursive: true });

const run = (cmd, args, input) => {
  const r = spawnSync(cmd, args, { input, maxBuffer: 1 << 28 });
  if (r.status !== 0) { process.stderr.write(r.stderr ?? ""); throw new Error(cmd + " failed"); }
  return r.stdout;
};
const ff = (args, input) => run("ffmpeg", ["-y", "-loglevel", "error", ...args], input);

/** Black, blurred, 34 % copy of a cutout: the soft shadow a paper piece casts on the sheet under it. */
function shadowOf(src, dst) {
  ff(["-i", src, "-vf", "pad=iw+80:ih+80:40:40:color=black@0,format=rgba,colorchannelmixer=rr=0:gg=0:bb=0:aa=0.34,gblur=sigma=9", dst]);
}

function claude() {
  const png = join(OUT, "claude-raw.png");
  run("rsvg-convert", ["-w", "600", "-h", "602", CLAUDE_SVG, "-o", png]);
  ff(["-i", png, "-vf", "pad=iw+80:ih+80:40:40:color=black@0", join(OUT, "claude.png")]);
  shadowOf(png, join(OUT, "claude-shadow.png"));
}

/** The Codex icon is a cloud on a white tile. Keep saturated cloud pixels plus everything they enclose (the >_ glyph). */
function codex() {
  const S = 1024, px = ff(["-i", CODEX_PNG, "-vf", "scale=1024:1024,format=rgba", "-f", "rawvideo", "-"]);
  const sat = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat[i] = mx ? (mx - mn) / mx : 0;
  }
  const outside = new Uint8Array(S * S), stack = [0];
  outside[0] = 1;
  while (stack.length) {
    const i = stack.pop(), x = i % S, y = (i / S) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < S - 1 ? i + 1 : -1, y > 0 ? i - S : -1, y < S - 1 ? i + S : -1]) {
      if (j >= 0 && !outside[j] && sat[j] < 0.2) { outside[j] = 1; stack.push(j); }
    }
  }
  let x0 = S, y0 = S, x1 = 0, y1 = 0;
  for (let i = 0; i < S * S; i++) {
    const a = outside[i] ? Math.max(0, Math.min(1, (sat[i] - 0.05) / 0.15)) : 1;
    if (a > 0 && a < 1) for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.max(0, Math.min(255, (px[i * 4 + c] - (1 - a) * 255) / a));
    px[i * 4 + 3] = Math.round(a * 255);
    if (a > 0.5) { const x = i % S, y = (i / S) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, raw = join(OUT, "codex-raw.png");
  const vf = "crop=" + cw + ":" + ch + ":" + x0 + ":" + y0;
  ff(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", S + "x" + S, "-i", "-", "-vf", vf, "-frames:v", "1", raw], px);
  ff(["-i", raw, "-vf", "pad=iw+80:ih+80:40:40:color=black@0", join(OUT, "codex.png")]);
  shadowOf(raw, join(OUT, "codex-shadow.png"));
  console.log("codex cutout " + cw + "x" + ch);
}

/** Transparent sheet of fibres, pulp blotches and burnt edges, laid over every frame with normal blend. */
function grain() {
  const W = 1920, H = 1080;
  let seed = 90210;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const cell = 90, gw = Math.ceil(W / cell) + 2, grid = Float32Array.from({ length: gw * (Math.ceil(H / cell) + 2) }, rnd);
  const v = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const gx = x / cell, gy = y / cell, ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy;
    const n = (grid[iy * gw + ix] * (1 - fx) + grid[iy * gw + ix + 1] * fx) * (1 - fy) + (grid[(iy + 1) * gw + ix] * (1 - fx) + grid[(iy + 1) * gw + ix + 1] * fx) * fy;
    v[y * W + x] = (n - 0.5) * 16 + (rnd() - 0.5) * 12;
  }
  for (let i = 0; i < 7000; i++) {
    let x = rnd() * W, y = rnd() * H, a = rnd() * 6.3;
    const len = 10 + rnd() * 70, tone = (rnd() < 0.6 ? -1 : 1) * (8 + rnd() * 14);
    for (let s = 0; s < len; s++) { a += (rnd() - 0.5) * 0.4; x += Math.cos(a); y += Math.sin(a); if (x >= 0 && y >= 0 && x < W && y < H) v[(y | 0) * W + (x | 0)] += tone; }
  }
  const px = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const x = i % W, y = (i / W) | 0, edge = Math.min(x, y, W - 1 - x, H - 1 - y), burn = edge < 120 ? (120 - edge) / 120 * 28 : 0;
    const t = v[i] - burn, light = t > 0;
    px[i * 4] = light ? 255 : 58; px[i * 4 + 1] = light ? 250 : 40; px[i * 4 + 2] = light ? 240 : 24;
    px[i * 4 + 3] = Math.min(110, Math.round(Math.abs(t) * (light ? 2.2 : 3)));
  }
  ff(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", W + "x" + H, "-i", "-", "-frames:v", "1", join(OUT, "grain.png")], px);
}

function fonts() {
  for (const [from, to] of [["KoPubWorld Batang Medium.ttf", "batang.ttf"], ["KoPubWorld Batang Bold.ttf", "batang-bold.ttf"], ["KoPubWorld Dotum Medium.ttf", "dotum.ttf"], ["KoPubWorld Dotum Bold.ttf", "dotum-bold.ttf"]]) {
    copyFileSync(join(FONT_DIR, from), join(OUT, "fonts", to));
  }
}

claude(); codex(); grain(); fonts();
console.log("media ready in " + OUT);
