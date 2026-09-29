# 0.4 — hardware encode modes, example workspaces, Bun measurement, first npm release

Work lands through PRs into `dev`; `dev` is promoted to `main` and released as 0.4.0, the first npm publication of `vid2-gen`.
Research inputs: [001_research.md](001_research.md).

| WP | Branch | Scope |
|---|---|---|
| 1 | `codex/vid2-examples-workspace` | Examples keep code and how-to only; media, captures and renders move to `$VID2_HOME/examples/<name>` |
| 2 | `codex/vid2-hw-encode` | `--hw-accel disable\|if-possible\|required`, `--hw-encoder`, probed encoders, HEVC/ProRes hardware, calibrated quality |
| 3 | `codex/vid2-bun` | Bun as an optional runtime: measured, documented, smoke-tested in CI |
| 4 | `codex/vid2-release-0.4.0` | Version, changelog, release workflow, promotion to `main`, npm publish |

## WP1 — example workspaces

`examples/workspace.mjs <name>` copies an example's repository sources into `$VID2_HOME/examples/<name>` and leaves
`media/`, `out/`, `.work/` and `*.vid2cap/` alone. All generated material was moved there first (file counts checked per example),
then removed from the checkout: 1.5 GB of untracked renders and the tracked vid2-launch captures/stills and ima2 icon (about 2.8 MB,
several over the 200 KB fixture rule). `.gitignore` now ignores those four folders in every example. Two new motion examples,
`opus-astra-paper` and `claude-codex-dawn`, are committed as build scripts plus READMEs; their generated `timeline.json` is ignored.

Tests: CI checks committed timelines against the schema, that `git ls-files examples` lists no media/capture/render files, and that
`workspace.mjs` overwrites sources while keeping workspace media. The full vid2-launch validate + two-pass render reads the developer
workspace and stays behind `VID2_EXAMPLE_TEST=1`.

Verification (2026-09-29, M5 Pro, ffmpeg 9.0.2):

- `node --test tests/e2e/examples.test.ts` — 6 pass, 1 skipped (gated)
- `VID2_EXAMPLE_TEST=1 node --test --test-name-pattern two-pass tests/e2e/examples.test.ts` — pass (20.8 s), using `~/.vid2/examples/vid2-launch`
- `npx eslint examples tests/e2e/examples.test.ts` — clean

## Baseline measurements (opus-astra-paper, 1920×1080, 30 fps, 759 frames, cold caches)

| Run | Wall | Output |
|---|---|---|
| Node 26, software (`libx264 -preset slow -crf 18`) | 69.6 s | 65.3 MB |
| Node 26, `--hw` (`h264_videotoolbox -q:v 65`) | 36.4 s | 5.7 MB |
| Bun 1.4.0, software | 60.6 s | video stream MD5 identical to Node |

The hardware run saves the final-encode time but its 11× smaller file needs a quality check before the setting is kept (WP2).
