# 060 — wp7 Agent layer (QA, preview, skills, templates, init, capabilities)

Consumes 010–050. Research: 006_agent_research.md (digest of Aside 030-agent-packaging-and-timeline.md; HyperFrames / Remotion /
auto-editor skill structures; Agent Skills spec), x-survey patterns. ARCH-09.

## wp7 architect consultation

Architect Gibbs W7-01..W7-06 (2026-09-28). Local check: a planted 4 s fault clip gave blackdetect 1.0–1.8 s, freeze starts, −3.6 LUFS and
+2.2 dBFS true peak, and ffmpeg produced contact/spectrogram/waveform PNGs; a 2 s proxy render and still extraction are a cheap preview fixture.
Dispositions:

- W7-01 accept: main writes `src/qa/report.ts` first: `QaIssue = {id, check, severity: "fail"|"warn", status: "open"|"waived", code, message,
  measured?, threshold?, range?: [startS, endS], fix, waiver?: {reason, source: "cli"|"timeline"}}`, `QaReport = {version: 1, video, status:
  "pass"|"warn"|"fail", checks: Record<check, "pass"|"warn"|"fail"|"skipped">, issues, artifacts: Record<string, string>, facts}`, plus
  `PreviewRequest/PreviewResult` types and the `qa.waive` schema chain.
- W7-02 accept: QA = evidence report; `frozen` is a **warning** (intentional stills are legitimate) unless `--strict-motion`; waived issues stay in the
  report with their reason; exit 6 only for open `fail` issues. Adds scene seam ±1-frame stills. Tests plant a ≥3 s freeze, a black interval and
  clipped audio and assert measured ranges, severity, exit code and artifact files.
- W7-03 accept: preview window is bounded by the touched scene pair; it reuses the segment cache; tests compare preview vs. full proxy render at a seam,
  during a global flash and during a sweep overlay (mean abs diff < 2/255).
- W7-04 accept: router + domain skills as listed below, references one level deep and link-checked by `skills:check`; rules give defaults and
  replacements (gradients, neon, idle wobble, repeated centred cards, RGB split, lens flare are "reconsider" prompts, not bans); the loop does not
  impose an approval stop on users who already authorized rendering; `vid2 skill install --dir|--tmp|--agent`, `list`, `path`; JSON lists
  installed paths; a second install changes 0 files.
- W7-05 accept with renamed templates: `launch-teaser` (30 s, synth music, text + generated hero), `feature-demo` (capture-driven, steps.json +
  a tiny local site), `changelog`, `social-vertical` (1080×1920). `--placeholders` also covers **uncached generate sources** (stripe PNG images,
  `W_PLACEHOLDER <sourceId>`, never a provider call); without it the existing missing-asset errors stand.
- W7-06 accept (lanes below). Gate: `npm test`, `skills:check`, a real skill install into a temp dir, and `init → proxy render → qa` for every template.

| Lane | Owner | Exclusive write scope |
|---|---|---|
| 0 (first) | main | `src/qa/{report,index}.ts`, `qa.waive` in `src/timeline/{schema,types,resolve}.ts` + schema JSON |
| QA | sol | `src/qa/{run,checks,artifacts,probe,waivers}.ts` + tests, `src/cli/commands/{qa,probe}.ts` |
| Preview | sol | `src/qa/preview.ts` + tests, `src/cli/commands/preview.ts`, `src/render/runner.ts` (export `renderSegments` only) |
| Skills | sol | `skills/**`, `src/skill/**`, `src/cli/commands/skill.ts`, `scripts/{skills-manifest,skills-lint}.mjs`, `.claude-plugin/**`, `skills-manifest.json`, `structure/skills.md` |
| Templates | sol | `templates/**`, `src/cli/commands/init.ts` + tests |
| Integration (last) | main | registry, `src/cli/commands/{capabilities,render}.ts`, `--placeholders` in `src/cli/commands/{plan-shared,compile}.ts` + `src/assets/resolve.ts`, `tests/e2e/pack.test.ts`, package.json (files: skills, templates), CI, `structure/qa.md`, README, e2e |

## Scope

IN: `vid2 qa` (artifacts + issues), `vid2 preview` (stills at times without a full render), `vid2 probe <media>`, `vid2 resolve` (full resolved
timeline JSON), `vid2 capabilities --json` (commands + doctor summary + providers + schema ids), `vid2 init <template> [dir]`, templates,
skill package (router + domain skills, Agent Skills spec compliant), `vid2 skill install|path|list`, `.claude-plugin/plugin.json`,
`skills-manifest.json` + `npm run skills:check` lint (frontmatter name = dir, description ≤ 1024, no inline backtick-bang patterns).
OUT: hosted docs site.

## QA (src/qa/*) — `vid2 qa <video> [--timeline t.json] [--out dir] [--json]`

Outputs under `<out>/` (default `<video>.qa/`): `qa.json`, `contact.png` (fps=1/2 tiles 6×N, 480 px), `keyframes/<scene>-{start,mid,end}.png`
and `keyframes/event-<id>.png` (when a timeline is given: resolved scene/event frames), `waveform.png`, `spectrogram.png`, `probe.json`.
Checks → issues (the `QaIssue` contract above: severity "fail"|"warn"):
- `format` (codec/pix_fmt yuv420p/even dims/faststart), `duration` (vs resolved total ± 1 frame), `black` (blackdetect d=0.5, pic_th .98,
  pix_th .02; outside intentional fades), `frozen` (`freezedetect=n=-60dB:d=3` → "static for ≥ 3 s": the HyperFrames sweep_static idea),
  `silence` (silencedetect when audio expected), `loudness` (ebur128 I within target ± 1, TP ≤ target), `av_sync` (audio duration vs video),
  `text_safe` (timeline-level: text boxes within 5% title-safe margins using ASS metrics estimate), `contrast` (timeline-level: text color vs
  sampled background luminance at the text's first visible frame, WCAG ratio ≥ 3 for ≥ 48 px).
Waivers: `--waive black@0-0.4,frozen@12-16` or timeline `qa.waive[]`. Exit 6 when any open (unwaived) "fail" issue remains.
Field chain for `qa.waive` (audit blocker 3): creation — MODIFY src/timeline/schema.ts: `TimelineSchema` gains
`qa: z.strictObject({ waive: z.array(z.strictObject({ check: z.enum(["black","frozen","silence","loudness","text_safe","contrast","duration"]),
from: TimeLiteral, to: TimeLiteral, reason: z.string().min(3) })).default([]) }).default({ waive: [] })`; serialization — regenerated
schema/timeline.v1.json (drift test); deserialization — resolve.ts MODIFY adds `ResolvedTimeline.qa.waivers: {check; fromFrame; toFrame; reason}[]`;
consumer — src/qa/waivers.ts merges CLI `--waive` with resolved waivers and marks matching issues `waived` in qa.json; tests — schema parse,
unknown key rejected, drift, resolve frames, waiver suppression e2e.

## Preview (src/qa/preview.ts) — `vid2 preview <timeline> --at 0,25%,1.5s,drop,click#2 [--out dir] [--profile proxy]`

Resolves each time to frame N and renders the **final composition** at N (reflection gap 3). Time fidelity (audit blocker 2): the preview never
re-bases time. It builds the window W = [start of the scene containing N (or of the earlier scene when N is inside a transition window), N] and
runs the exact segment graph(s) from their frame 0 (so every `n`/`t`/`in` expression inside a segment evaluates as in the full render), the join
step for that window when N is inside a transition, then shifts PTS to absolute timeline time before the PostPlan with
`setpts=PTS+(<W.startFrame>*<fps.den>/<fps.num>)/TB` (frames converted to seconds; audit round 2 blocker 2), and finally
`select='eq(n,<N-W.startFrame>)'`, `-frames:v 1`. Cost is bounded by the touched scene (or scene pair inside a transition, W7-03). PostPlan filters are time-based by contract (020 Effects): they
use `t`, never `n`, so absolute PTS is sufficient for identical evaluation.
Proxy profile by default (`--profile final` for full resolution); no audio. `preview.json` records frame, scene(s), window and
`composition: "final"`. `--segment-only` renders the bare segment and labels the still `composition: "segment"`. Tests: stills at (a) a fade
midpoint, (b) the peak of a global `flash` effect, (c) mid-sweep of a global `overlay` with `motion: sweep`, (d) a global `rgbsplit` window inside the third scene (later-scene
absolute timing) each match the same frame extracted from a full render (mean absolute pixel difference < 2/255 on the proxy profile).

## Skill package (skills/*) — Agent Skills spec (agentskills.io): name = dir, description what+when with triggers, optional compatibility

```text
skills/vid2/SKILL.md                 router: state table (existing project op / timeline exists / fresh brief) + route table + the loop
skills/vid2/agents/openai.yaml       Codex UI metadata
skills/vid2-timeline/SKILL.md        contract: schema v1, time literals, markers, events, errors (code → fix), recipes
skills/vid2-timeline/references/{schema.md,time.md,errors.md,recipes.md}  skills/vid2-timeline/assets/timeline.v1.json (copied at build)
skills/vid2-direction/SKILL.md       creative defaults you must override: pacing (build/breathe/resolve), speed vocabulary, easing map, transitions
                                     as meaning, continuity (one dominant direction), typography (weight contrast, sizes, no two sans), anti-cliché
                                     list ("You default to X. Stop." with the replacement), storyboard stills before motion, reference-video transcription
skills/vid2-direction/references/{motion.md,camera.md,typography.md,anti-patterns.md,storyboard.md,brief-template.md}
skills/vid2-capture/SKILL.md         steps files, action labels, real UI rules (no invented UI), permissions per OS, auto camera tuning
skills/vid2-audio/SKILL.md           beats (declared vs detected, pacing beat_cut vs phrase_flow), cues (riser end/impact/whoosh peak on the cut),
                                     providers, loudness targets, voice ducking
skills/vid2-cli/SKILL.md             the loop: validate → resolve → preview stills → (ask only if the user wants to review stills first) → render --profile proxy → qa → fix → render final → qa;
                                     JSON envelope, exit codes, "commands you should not run" (no raw ffmpeg edits of outputs; no provider calls in render)
.claude-plugin/plugin.json           {name:"vid2", version, skills:["./skills/vid2", …]}
skills-manifest.json                 {skill: {files, sha256}} generated by scripts/skills-manifest.mjs
```
Every rule states a default and a concrete replacement (numbers, not adjectives). Content sources: 006 digest, x-survey recurring patterns,
this project's own prototype lessons (002). `vid2 skill install [--dir <path>] [--agent codex|claude|cursor|agents] [--link]` copies (or
symlinks) `skills/*` into the chosen directory (defaults: codex `~/.codex/skills`, claude `~/.claude/skills`, agents `./.agents/skills`),
idempotent (content hash compare), prints what changed; `vid2 skill path [name]`, `vid2 skill list --json`. README documents
`npx skills add lidge-ai/vid2-gen` as the primary route.

## Templates + init

`templates/{launch-teaser,feature-demo,changelog,social-vertical}/` (W7-05): `timeline.json` (+ `steps.json` for demo, `BRIEF.md` stub, README). `vid2 init
<template> [dir] [--force]` copies and rewrites relative paths; refuses a non-empty dir without --force. All templates validate in CI and
render (proxy) in the e2e suite using placeholder PNGs when their sources are absent (`--placeholders`).

## CLI contract additions (MODIFY 010 contract, additive)

Error JSON gains `fix` (actionable one-liner) and every envelope gains `meta: {vid2: version}`; `resolve`, `capabilities`, `probe`, `preview`, `qa`,
`init`, `skill` registered.

### Audit wp7 round 1 folds

- QA format matrix (blocker 1): `format` checks per container/codec — mp4/mov + h264/hevc: yuv420p, even dims, faststart (fail if moov after mdat);
  mov + prores: yuv422p10le, no faststart requirement; webm + vp9: yuv420p, faststart not applicable. Severities fixed in `src/qa/report.ts`:
  fail = format, duration (± 1 frame), black (outside declared fades/waivers), loudness TP > target + 0.5, av_sync > 1 frame; warn = frozen, silence,
  loudness I outside ± 1, text_safe, contrast. `facts = {container, codec, pixFmt, width, height, fps, frames, durationS, faststart?, audio?: {codec,
  durationS, integrated, truePeak, lra}}`. Tests: valid ProRes and WebM pass the format check; an mp4 re-muxed without faststart fails.
- Preview joins (blocker 2): preview does not reuse full-timeline join steps. For a frame N inside a transition between segments i and i+1 it renders
  both segments (cache-backed via an exported `renderSegments(plan, ids, opts)` in `src/render/runner.ts`, MODIFY by the Preview lane) and builds a
  local two-input xfade with `offset = (frames_i − T_i)/fps`, then shifts PTS by `start_i` before the PostPlan; otherwise it renders one segment.
  Tests compare preview vs. full proxy render at the **second** transition of a three-scene timeline with a global sweep overlay active there.
- Skill packaging (blocker 4): `scripts/skills-manifest.mjs` copies `schema/timeline.v1.json` into `skills/vid2-timeline/assets/` and writes
  `skills-manifest.json`; `npm run build` = `tsc -p tsconfig.build.json && node scripts/skills-manifest.mjs`; package.json `files` adds
  `skills`, `templates`, `skills-manifest.json`, `.claude-plugin`. The pack test runs `vid2 skill list --json`, `skill path` and
  `skill install --dir <tmp>` from the installed tarball outside the checkout, plus `vid2 init feature-demo`.
- Round 2: audio artifacts (`waveform.png`, `spectrogram.png`) and checks (silence, loudness, av_sync) are produced only when the video has an audio
  stream; otherwise they are `skipped` (a `--expect-audio` flag or a timeline with `audio` turns a missing stream into a `fail`). Test: qa on a valid
  video-only render passes with those checks skipped.
- Round 3: `feature-demo` ships a recorded fixture session (`templates/feature-demo/demo.vid2cap/`: session.json, actions.jsonl, footage.mp4
  under 200 KB, captured from the template's own `site/` with `vid2 capture web`) so `init → render` works cold, including its EventRefs; its README
  shows the one command that re-records it. Test: `init feature-demo` into a fresh dir → proxy render → qa passes.
- Follow-ups: `vid2 skill install --tmp` is in the command syntax; the C gate runs `init → proxy render --placeholders → qa` for **all four** templates.

## File map

NEW src/qa/{run,checks,artifacts,preview,probe,waivers}.ts, src/qa/index.ts, src/skill/{install,manifest}.ts, src/skill/index.ts,
src/cli/commands/{qa,preview,probe,capabilities,init,skill}.ts (resolve.ts exists since 010; MODIFY it only to add `meta`), skills/** (above), templates/**, scripts/skills-manifest.mjs,
scripts/skills-lint.mjs, .claude-plugin/plugin.json; tests: checks on generated media with injected faults (black gap, 4 s freeze, silence),
waivers, preview frame selection, skill install idempotency to a temp dir, skills lint, templates validate + proxy render.
MODIFY package.json scripts (`skills:check`), .github/workflows/ci.yml (`npm run skills:check` in the checks job), README (Agents section),
src/timeline/schema.ts + src/timeline/resolve.ts (qa.waive chain), src/cli/commands/{compile,render,preview}.ts + src/assets/resolve.ts (`--placeholders`),
structure/qa.md + structure/skills.md NEW.

**Placeholders (normative, audit rounds 1-4).** `--placeholders` is an option of compile, render and preview. `materializeSources(mode "placeholders")`
(src/assets/resolve.ts) resolves cached generate sources to their files; every uncached generate source and every file source whose path does not exist
is rewritten to `{type: "image", path}` pointing at a labelled stripe PNG (pure JS via src/compile/png.ts, sized from the output, cached under
`cacheDir("placeholders")`); video placeholders are stills. A missing **audio** file is dropped from audio.music/voice (and cues that reference it)
with a warning. Every substitution emits `W_PLACEHOLDER <sourceId>`; no provider is called; compile, media and overlay builders need no placeholder
code, and the second validation passes. Without the flag the existing errors stand (missing file → E_NOT_FOUND "pass --placeholders or add the
file"; uncached generate → the 050 fix). Owners: Integration (`src/assets/resolve.ts`, `src/cli/commands/{plan-shared,compile,render}.ts`);
preview's flag belongs to the Preview lane. Tests: a missing image, a missing overlay file and an uncached generated source through compile, render
and preview (fake ima2 counter 0), and the failures without the flag.

## Verification (C for wp7)

`npm test`, `npm run skills:check`; `vid2 skill install --dir /tmp/vid2-skills-test --json` lists 6 skills and a second run reports 0 changed;
`vid2 init launch-teaser /tmp/v2t && vid2 render /tmp/v2t/timeline.json --profile proxy --placeholders -o /tmp/v2t/out.mp4 && vid2 qa /tmp/v2t/out.mp4
--timeline /tmp/v2t/timeline.json --json` → ok with artifacts.
