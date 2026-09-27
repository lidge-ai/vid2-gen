# 000 — vid2-gen roadmap (master plan)

**Summary.** Coding agents can already write motion-graphics code, but nobody ships a CLI that
captures a real product, pulls generated assets, cuts everything to a beat and checks its own
output. vid2-gen (binary `vid2`) is that tool: an agent or a human writes one declarative
`timeline.json`; vid2 captures footage with event logs, resolves assets (plain files or the
optional ima2-gen adapter), compiles the timeline into deterministic ffmpeg segment graphs with
libass typography and a synthesized or supplied soundtrack, renders proxy and final outputs, and
emits QA artifacts an agent can read. It targets launch, demo and showcase videos that would
otherwise need CapCut. Research lives in 001-006; each implementation phase has a decade doc.

## Loop spec

| Field | Value |
|---|---|
| Loop archetype | Satisfy-spec, multi-cycle HOTL (cxc-loop), one PABCD per work-phase wp1..wp9 |
| Trigger | User request 2026-09-27: scaffold lidge-ai/vid2-gen from scratch as cleanly as ../opencodex, run cxc-loop with unlimited sol dispatch and Aside research, keep going until a repository with real editing capability and guidelines is pushed and deployed |
| Goal | Public repo lidge-ai/vid2-gen with a working, tested, documented `vid2` CLI, packaged agent skill, dogfood video, npm package `vid2-gen`, GitHub release |
| Non-goals | GUI editor; hosted render service; bundling proprietary fonts; unofficial Suno wrappers; changes to ima2-gen product code or its remote; HDR; generic raw-filter passthrough in v0.1 (typed effects only) |
| Verifier | Per phase: `npm run typecheck`, `npm run lint`, `npm test` (node:test, includes small real ffmpeg renders), `npm run build`, `npm pack` + install smoke; phase-specific commands listed in each decade doc; wp9: GitHub Actions on macOS/Windows/Linux + `npm view vid2-gen` |
| Stop condition | All ten goalplan criteria met with fresh evidence, or an exact NEEDS_HUMAN blocker (npm first-publish login/2FA) recorded |
| Memory artifact | This unit: vid2-gen/devlog/_plan/260927_vid2_roadmap/ (000 attestation log below), goalplan .codexclaw/goalplans/build-publish-and-document-vid2-gen-*/ in the native cwd |
| Terminal outcomes | DONE (released + verified), NEEDS_HUMAN (npm auth wall; everything else done), BLOCKED (host-rule blocker repeated 3 turns) |
| Escalation | npm login/2FA, GitHub org policy refusal, a design decision that changes the public schema after release, anything destructive outside the new repo. Delegation: after two distinct agents fail the same packet, main reclaims it |

HOTL bounds: user granted unlimited tokens/time, unlimited sol subagents and Aside research;
write scope is the vid2-gen worktree plus scratch under /tmp and the Aside artifact directory;
external writes allowed: create/push lidge-ai/vid2-gen, its CI, npm publish of vid2-gen, GitHub release.

## Mechanics

- Source: orphan-branch linked worktree `codex/vid2-gen` of the ima2-gen repository at
  vid2-gen, bound with `cxc session source`. History is
  independent of ima2-gen. It is pushed to lidge-ai/vid2-gen `main`. After the goal closes the
  checkout can be replaced by a plain clone (090).
- Plan docs live in this repo (planUnit is the absolute path of this folder).

## Architect consultation (formal P)

Architect handle: sol subagent `01a0e327-89a3-7dd1-82df-f4bfaab3a280` (Gibbs), proposal ARCH-01..ARCH-10
(received 2026-09-27). Dispositions:

| ID | Proposal | Disposition |
|---|---|---|
| ARCH-01 | Single TS package, feature folders with boundary index.ts, commands doctor/init/schema/capture/compile/render/audio/assets/qa/skill | **Accept.** Add `probe` as the internal owner of ffmpeg discovery (doctor is its CLI face) and `fonts` handling inside `compile/text` |
| ARCH-02 | `--json` single result object; exit 0/2/3/4/5/6 | **Accept**, plus exit 1 = unexpected internal error and exit 7 = interrupted/timeout |
| ARCH-03 | schemaVersion 1; seconds/frames/beats resolved to integer frames; JSON Schema as contract, validator at ingress | **Amend.** Author the schema in zod 4 (single runtime dependency) and publish `z.toJSONSchema()` output via `vid2 schema --json` and `schema/timeline.v1.json`; a CI test fails if the committed JSON Schema drifts from the zod source (removes the drift risk the architect raised). Top-level shape is **scenes** (each scene = one segment) with layers, plus global overlay and audio tracks, instead of free tracks: it matches segment rendering (ARCH-04) and is easier for agents (editly/HyperFrames precedent) |
| ARCH-04 | Typed IR; render segments then join; normalization contract; xfade offset math from probed frame counts | **Accept** |
| ARCH-05 | ASS typography; effects registry with capability requirements; doctor probes; no silent fallback; content-hash segment cache | **Accept.** Font policy: bundle OFL Geist, Geist Mono and Instrument Serif with their OFL texts (research 006 flags Inter as a lazy default and asks for sans+serif pairing and 900/400 weight contrast); other fonts (e.g. Pretendard for Korean) from system paths or explicit files |
| ARCH-06 | JSONL event log with monotonic clock + calibration; CDP quantization; native via ffmpeg devices + optional input helper; terminal via cast | **Accept.** v0.1 support levels: web = stable; Electron = experimental; native macOS = stable (avfoundation) with optional input events via optional dependency `uiohook-napi`; native Windows/Linux = experimental; terminal = experimental (VHS tape via `vhs`, or asciinema cast via `agg` → GIF → ffmpeg; both external tools detected by doctor) |
| ARCH-07 | Declared or detected beat grid saved for review; aevalsrc presets; providers; onset-aligned cues; two-pass loudnorm | **Accept.** Detection = built-in JS spectral-flux onset + autocorrelation tempo on ffmpeg-decoded PCM, labelled assistive, written to beats.json |
| ARCH-08 | Provider port capabilities/resolve/materialize; files default; ima2 via JSON CLI; no `video extend` | **Accept** |
| ARCH-09 | qa.json + artifacts + issue IDs; compile→proxy→qa→edit loop; waivers | **Accept** |
| ARCH-10 | Small deps, ffmpeg external, Playwright optional peer; unit + snapshot + tiny real renders on 3 OSes; pack smoke; manual first publish | **Accept** |

Unresolved assumptions resolved by main: output default 1920x1080 @ 30 fps SDR; HDR out; minimum stable
effect set = kenburns, punch, pan, blurfill, window (mask/shadow/border/perspective), grade (lut3d/curves/eq),
motionblur (tmix), chroma (chromakey+despill), leak, vignette, grain, flash, rgbsplit (the last is kept but the
skill lists it among clichés to use sparingly); beats may start from a declared BPM or an imported beats.json
and the built-in detector ships in 050.

Reflection (same architect, 2026-09-27): **MISALIGNED** with 5 gaps, all accepted and fixed in the docs: (1) rational fps timebase → AVTB
normalization + 30000/1001 test (020 Joins); (2) spare frames leaking across a cut → per-join trim contract + fade→cut→fade colour test (020 Joins);
(3) preview composing only a segment → preview renders the final composition at the frame, `--segment-only` labelled (060 Preview); (4) typed text
in capture logs → redacted by default, `--record-text` opt-in (030 Session); (5) terminal path conflict and tag-before-publish ordering → VHS/agg in
the ARCH-06 row, tag created before publishing (080). All ten ARCH decisions map to plan sections (ARCH-02/03/05/06 amended with reasons).

## Audit log (A phase)

Round 1 (reviewer sol `01a0e339-8eee-7183-b816-7b3f3e5ee8b6` "Euler", 2026-09-27): **VERDICT: FAIL**, 8 High blockers. Synthesis (root causes →
fix, all accepted, none rebutted): (1) join guard vs trim contract used strict `<` → `<=` with the reasoning recorded (020 Joins/Runner);
(2) preview re-based time → preview keeps segment-relative time and shifts PTS to absolute before PostPlan, tests against a full render for
fade, flash and sweep (060); (3) later schema fields lacked full chains and zod objects would silently strip unknown keys → strict objects +
schema change protocol (010) + explicit chains for qa.waive (060), audio fields and AudioPlan ownership (040), cursor/camera auto (030);
(4) `--generate`/`--placeholders` had no owning change → exact command/compiler changes and on/off tests (050, 060); (5) CI capture coverage
not planned → ci.yml change + skip-is-failure rule on Ubuntu (030); (6) dogfood fallbacks not executable → code-page files, `--serve`, stills
timeline + tests (070, 030); (7) first-publish workflow ordering → release.yml committed before the tag, token-or-OIDC (080); (8) personal
paths in docs → removed, privacy-scan script from wp2 on (010, 080). Non-blocking: ima2 480p added to the adapter resolutions (050).
Round 2 (same reviewer): **VERDICT: FAIL**, 5 High blockers introduced or left by round-1 fixes, all accepted: (1) schema code still used
`z.object` → every schema example now `z.strictObject` (010/030); (2) preview PTS shift mixed frames and seconds and post-graph `n` stayed
relative → seconds conversion + PostPlan time contract (`t` only, unit-tested) + later-scene rgbsplit comparison (060, 020); (3) VHS fallback
signal had no producer → `tools: {vhs, agg, asciinema}` in doctor via src/probe/tools.ts with present/absent tests (010); (4) release
publishers could race and upload preceded creation → single publisher chosen via repo variable NPM_PUBLISH_MODE before the tag, workflow never
touches releases, release created with assets in one command after publish (080); (5) privacy scanner matched its own spec → complete token
shapes with minimum lengths, doc/README zero-hit test (080). Non-blocking folded: 480p in the adapter command (050), stale `<` wording (020).
Round 3 (same reviewer): **VERDICT: FAIL**, 1 High blocker: the release workflow's guard step could not skip later steps → job-level
`if` on `vars.NPM_PUBLISH_MODE`, fail-fast when token mode lacks the secret, and an observed skipped run in mode none before the tag (080).
Non-blocking folded: src/probe/tools.test.ts named in the 010 file map.
Round 4 (same reviewer): **VERDICT: GO-WITH-FIXES (blockers=0)**; the one file-map note (resolve.ts listed NEW twice) folded in 060.
Architect recheck: no documented ARCH decision changed (all fixes refine contracts inside ARCH-03/04/06/09/10), so no reflection call is needed.

wp2 A rounds (same reviewer Euler): FAIL(3: EventResolver boundary, activation tests, lane gaps) → FAIL(2: Windows .cmd shim vs shell-free
runner, requirePlaywright untested) → FAIL(1: wrong Playwright env var) → PASS; all folded into 010.

## Work-phase map (dependency order)

| Work-phase | Decade doc | Builds | Proves |
|---|---|---|---|
| wp1 | 000-00x | research + this roadmap | audited docs (A gate) |
| wp2 | 010_foundations.md | scaffold, CLI core, shared utils, probe/doctor, timeline schema + resolver, tests, lint, CI | installable `vid2`, `schema`, `doctor`, JSON/exit contract |
| wp3 | 020_render_core.md | compiler IR, segments, joins, effects registry, ASS text, render runner, cache, proxy/final | file-only timeline → frame-accurate video with transitions + text |
| wp4 | 030_capture.md | event log, quantizer, web CDP, Electron, native devices + input helper, terminal, auto camera | footage + aligned events; macOS native |
| wp5 | 040_audio.md | beat grid, synth presets, SFX placement, detection, providers, mix + loudness | ebur128-verified track synced to cuts |
| wp6 | 050_assets.md | provider port, files, ima2 adapter, manifest/cache | image + Grok clip via ima2 or honest gap |
| wp7 | 060_agent_layer.md | qa command, skill package + references, templates, `skill install`, `init` | skill installs; qa artifacts |
| wp8 | 070_dogfood.md | dogfood timeline + README demo, docs polish | vid2-rendered demo QA'd |
| wp9 | 080_release.md | GitHub repo, CI, npm publish, release | public repo green, npm published or NEEDS_HUMAN |
| closeout | 090_closeout.md | archive unit to _fin, standalone clone | clean handoff |

Criteria mapping: c-1 wp1; c-2 wp2 (+every later phase keeps it green, wp9 on hosted CI); c-3 wp2; c-4 wp3;
c-5 wp4; c-6 wp5; c-7 wp6; c-8 wp7; c-9 wp8; c-10 wp9.

## Global conventions (apply to every phase)

- Node >= 22.18 (type stripping on by default), TypeScript 5.9+, ESM only, source files `*.ts` using only erasable
  syntax (no enums/namespaces/parameter properties); imports use `.ts` extensions and `tsc` rewrites them
  (`rewriteRelativeImportExtensions`) when building `dist/`.
- Runtime dependency: `zod` only. Optional: `playwright-core` (peer, capture), `uiohook-napi` (optional
  dependency, native input events). Dev: typescript, @types/node, eslint + typescript-eslint.
- Tests: colocated `src/**/*.test.ts` for units; `tests/e2e/*.test.ts` for real renders; runner
  `node --test` via scripts/test.mjs (sets VID2_HOME to a temp dir, skips ffmpeg tests with a clear SKIP
  message only when ffmpeg is absent and `VID2_REQUIRE_FFMPEG` is unset; CI sets it).
- File size heuristic: split files beyond ~400 lines; functions under ~60 lines.
- Every command: `--json`, stable exit codes, no prompts; long jobs write manifests.
- Structure SoT: `structure/INDEX.md` + one doc per feature; each phase updates the docs it changes (SOT-SYNC-01).

## Attestation log

- **wp1 D (2026-09-27):** roadmap unit committed as e18dfca2 and verified (16 docs, 0 structural issues). Conclusion: the roadmap is
  locked; implementation starts with wp2 foundations from 010 exactly as audited. Direction for wp2: build shared/ first (errors, exec, time,
  json, hash, paths, log) because cli/probe/timeline import it, then run cli, probe, timeline and repo-scaffold lanes in parallel with
  disjoint write scopes.
- **wp2 D (2026-09-27):** lane 0 (c84c2721) plus four parallel sol lanes (tooling, timeline, probe, cli) integrated as 38c546c2.
  typecheck, lint, build and 43 tests green locally (pack test gated by VID2_PACK_TEST, passes); doctor --deep on macOS ffmpeg 8.0.1 reports
  libass and the drawtext canary as present. Conclusion: the CLI/JSON/exit contract, timeline schema v1 and probe are the stable base; the
  repo is pushed early so hosted 3-OS CI (c-2) runs from wp3 on. Direction for wp3: main writes compile/ir.ts, graph.ts, escape.ts first,
  then layer/effect/text/render lanes run in parallel.
- **wp3 D (2026-09-28):** render core shipped (bad3000b..2f9eb867 + examples/hello.json). Local: 118 tests (117 pass, 1 gated skip), packed
  install renders from outside the checkout, examples/hello.json renders 1280x720, 153 frames, yuv420p, no black run; hosted CI 36331869118 green
  on 3 OS x Node 22/24. Findings folded: Homebrew ffmpeg 9 has no libass/freetype → raster text backend (ADR-1, opentype.js); ffmpeg 6.1
  miscounts overlay n → enable windows use t; -filter_complex_script is gone in 8+/9 builds → legacy transport only below 7.1. Direction for wp4:
  main defines src/capture/{session,resolver}.ts and the source-frame → timeline-frame rule first (architect W4-01), then web, native,
  electron/terminal and camera/cursor lanes.
- **wp4 D (2026-09-28):** capture shipped (98e74f8e..a551b749): web (CDP screencast + quantizer), native (avfoundation tested; ddagrab/x11
  experimental), electron and terminal (experimental), capture CLI, auto camera and synthetic cursor. Strict receipt: 166 tests (161 pass, 5 gated
  skips), native live capture 60 frames 3024x1964, hosted CI 36337221673 green with the Ubuntu web e2e required. Findings folded: merged action
  groups must frame their union (dogfood exposed a crop that cut both targets); capture footage shorter than its layer holds the last frame;
  audit tightened E_ACCESS to permission-specific errors. Direction for wp5: concrete AudioPlan in ir.ts, mux in the runner, synth/SFX/mix lanes.
- **wp5 D (2026-09-28):** audio shipped (44a2c3ad..5dfac179): synth beds, SFX presets with anchors, auto cues from transitions and capture
  actions, provider audio via `vid2 audio generate` + manifest, mix/master/mux in render. Receipt: 202 tests (197 pass), synth bed detected at
  120 BPM, hello-audio −14.1 LUFS / −1.4 dBFS; CI green on Ubuntu ffmpeg 6.1.1. Finding folded: AAC overshoots true peak (−0.8 on 6.1.1), so the
  master ceiling sits 0.5 dB under the target. Direction for wp6: ima2 adapter through its JSON CLI, materialized into the same cache/manifest idea.
