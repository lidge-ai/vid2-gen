# 044 — WP5 live receipt (accept 3)

- Date: 2026-09-28. Host: macOS, ima2 3.23.1 at http://127.0.0.1:3333, Grok lane signed in by the user.
- Command: `node ../../src/cli/index.ts assets resolve timeline.json --json` in examples/generated-video (source checkout, branch codex/wp5-generated-clips).
- Result: ok, 1 generated, 48 s wall. Model `grok/grok-imagine-video-1.5`, request id `req_cli_video_mul3y12m_cj6ex9`. Probed: 5.041667 s, h264 1280×720 with aac. Cached under $VID2_HOME/cache/assets (not committed).
- Before sign-in the same command failed with E_CAPABILITY "Grok login required" and zero generations, as the guard/capability path intends.
- Not run locally (user rule: no local tests): render, qa and analyze of this example. The offline twin (lavfi 5 s clip on a 7 s layer, one W_GENERATED_CLIP_HOLD) runs in CI.
