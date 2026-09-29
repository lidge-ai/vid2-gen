# 030 WP3 results: Bun as an optional runtime

Question from the user: does running vid2 on Bun make it faster? Measured on an M5 Pro (Node 26.3 / 24.17, Bun 1.4.0, ffmpeg 9.0.2).

| Measurement | Node | Bun |
|---|---|---|
| `vid2 version` startup from dist, 3 runs | 0.08–0.09 s | 0.04–0.05 s |
| `vid2 version` from TypeScript sources (type stripping) | 0.14–0.16 s | 0.04–0.05 s |
| `scripts/bench-stage.mjs` (1080p, 90 frames, JS stage raster only), 2 runs | 63.8 / 63.7 fps | 51.4 / 51.1 fps |
| opus-astra-paper final render from dist, cold caches, alternating bun/node/bun/node | 53.95 / 53.86 s | 55.40 / 56.75 s |
| Video stream MD5 of the same render | identical | identical |

An earlier single pass (node first, then --hw, then bun) showed Bun 13% faster (60.6 s against 69.6 s); the alternating rerun did not
reproduce it, so that first Node run was paying cold-start costs. Rendering is dominated by ffmpeg and by the JS stage renderer, where
V8 is about 25% faster than JavaScriptCore on this workload.

Decision: Node stays the supported runtime and the package keeps `engines.node`. Bun is documented as compatible, and a CI job
(`bun`, ubuntu) builds with npm and runs `bun scripts/runtime-smoke.mjs --compare-node`. The smoke script validates and renders a small
timeline with shapes, a fade and a spring/rotation/colour stage layer under Bun and under Node, and requires identical frame MD5s.
The speed lever is `--hw-accel` (WP2), which halves this render.

Verification: `bun scripts/runtime-smoke.mjs --compare-node` → ok, both MD5=0c2d4879fecfdd416d3867792beada54; `node scripts/runtime-smoke.mjs` → ok;
`npx eslint scripts/runtime-smoke.mjs` clean. CI also runs on pushes to `dev` now.
