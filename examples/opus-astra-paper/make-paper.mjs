// Paints a 1920×1080 warm paper sheet (fibres, blotches, grain) in plain JS and saves it as PNG via ffmpeg. Usage: node make-paper.mjs media/paper.png
import { spawnSync } from "node:child_process";
const W = 1920, H = 1080, out = process.argv[2] ?? "media/paper.png";
let seed = 20260929;
const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function valueNoise(cell) {
  const gw = Math.ceil(W / cell) + 2, gh = Math.ceil(H / cell) + 2, g = Float32Array.from({ length: gw * gh }, rnd);
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x / cell, gy = y / cell, ix = gx | 0, iy = gy | 0, fx = s(gx - ix), fy = s(gy - iy);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
}

const shade = new Float32Array(W * H);
const big = valueNoise(260), mid = valueNoise(70), fine = valueNoise(9);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  shade[y * W + x] = (big(x, y) - 0.5) * 10 + (mid(x, y) - 0.5) * 5 + (fine(x, y) - 0.5) * 4 + (rnd() - 0.5) * 5;
}
// fibres: short wandering strokes, a little darker or lighter than the sheet
for (let i = 0; i < 5200; i++) {
  let x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI * 2;
  const len = 12 + rnd() * 60, tone = (rnd() < 0.7 ? -1 : 1) * (2 + rnd() * 5);
  for (let s = 0; s < len; s++) {
    a += (rnd() - 0.5) * 0.35; x += Math.cos(a); y += Math.sin(a);
    const xi = x | 0, yi = y | 0;
    if (xi >= 0 && yi >= 0 && xi < W && yi < H) shade[yi * W + xi] += tone * (1 - Math.abs(s / len - 0.5));
  }
}
const px = Buffer.alloc(W * H * 4), base = [241, 232, 214];
for (let i = 0; i < W * H; i++) {
  const v = shade[i], y = (i / W) | 0, x = i % W;
  const edge = Math.min(x, y, W - 1 - x, H - 1 - y), burn = edge < 140 ? (140 - edge) / 140 * 7 : 0;
  px[i * 4] = Math.max(0, Math.min(255, base[0] + v - burn));
  px[i * 4 + 1] = Math.max(0, Math.min(255, base[1] + v * 0.97 - burn * 1.2));
  px[i * 4 + 2] = Math.max(0, Math.min(255, base[2] + v * 0.9 - burn * 1.6));
  px[i * 4 + 3] = 255;
}
const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", W + "x" + H, "-i", "-", "-frames:v", "1", out], { input: px });
if (r.status !== 0) { process.stderr.write(r.stderr); process.exit(1); }
console.log("wrote " + out);
