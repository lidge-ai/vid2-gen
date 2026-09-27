# 060 — wp7 Agent layer (QA, preview, skills, templates, init, capabilities)

Consumes 010–050. Research: 006_agent_research.md (digest of Aside 030-agent-packaging-and-timeline.md; HyperFrames / Remotion /
auto-editor skill structures; Agent Skills spec), x-survey patterns. ARCH-09.

## Scope

IN: `vid2 qa` (artifacts + issues), `vid2 preview` (stills at times without a full render), `vid2 probe <media>`, `vid2 resolve` (full resolved
timeline JSON), `vid2 capabilities --json` (commands + doctor summary + providers + schema ids), `vid2 init <template> [dir]`, templates,
skill package (router + domain skills, Agent Skills spec compliant), `vid2 skill install|path|list`, `.claude-plugin/plugin.json`,
`skills-manifest.json` + `npm run skills:check` lint (frontmatter name = dir, description ≤ 1024, no inline backtick-bang patterns).
OUT: hosted docs site.

## QA (src/qa/*) — `vid2 qa <video> [--timeline t.json] [--out dir] [--json]`

Outputs under `<out>/` (default `<video>.qa/`): `qa.json`, `contact.png` (fps=1/2 tiles 6×N, 480 px), `keyframes/<scene>-{start,mid,end}.png`
and `keyframes/event-<id>.png` (when a timeline is given: resolved scene/event frames), `waveform.png`, `spectrogram.png`, `probe.json`.
Checks → issues `{id, severity: "error"|"warn", code, message, range?: [startS, endS], fix}`:
- `format` (codec/pix_fmt yuv420p/even dims/faststart), `duration` (vs resolved total ± 1 frame), `black` (blackdetect d=0.5, pic_th .98,
  pix_th .02; outside intentional fades), `frozen` (`freezedetect=n=-60dB:d=3` → "static for ≥ 3 s": the HyperFrames sweep_static idea),
  `silence` (silencedetect when audio expected), `loudness` (ebur128 I within target ± 1, TP ≤ target), `av_sync` (audio duration vs video),
  `text_safe` (timeline-level: text boxes within 5% title-safe margins using ASS metrics estimate), `contrast` (timeline-level: text color vs
  sampled background luminance at the text's first visible frame, WCAG ratio ≥ 3 for ≥ 48 px).
Waivers: `--waive black@0-0.4,frozen@12-16` or timeline `qa.waive[]`. Exit 6 when any error-level issue remains.
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
`select='eq(n,<N-W.startFrame>)'`, `-frames:v 1`. Cost is bounded by one scene. PostPlan filters are time-based by contract (020 Effects): they
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
skills/vid2-cli/SKILL.md             the loop: validate → resolve → preview stills → (approval) → render --profile proxy → qa → fix → render final → qa;
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

`templates/{launch-30s,feature-demo,showcase-grid,changelog}/`: `timeline.json` (+ `steps.json` for demo, `BRIEF.md` stub, README). `vid2 init
<template> [dir] [--force]` copies and rewrites relative paths; refuses a non-empty dir without --force. All templates validate in CI and
render (proxy) in the e2e suite using generated placeholder media (lavfi testsrc2) when their sources are absent (`--placeholders`).

## CLI contract additions (MODIFY 010 contract, additive)

Error JSON gains `fix` (actionable one-liner) and every envelope gains `meta: {vid2: version}`; `resolve`, `capabilities`, `probe`, `preview`, `qa`,
`init`, `skill` registered.

## File map

NEW src/qa/{run,checks,artifacts,preview,probe,waivers}.ts, src/qa/index.ts, src/skill/{install,manifest}.ts, src/skill/index.ts,
src/cli/commands/{qa,preview,probe,capabilities,init,skill}.ts (resolve.ts exists since 010; MODIFY it only to add `meta`), skills/** (above), templates/**, scripts/skills-manifest.mjs,
scripts/skills-lint.mjs, .claude-plugin/plugin.json; tests: checks on generated media with injected faults (black gap, 4 s freeze, silence),
waivers, preview frame selection, skill install idempotency to a temp dir, skills lint, templates validate + proxy render.
MODIFY package.json scripts (`skills:check`), .github/workflows/ci.yml (`npm run skills:check` in the checks job), README (Agents section),
src/timeline/schema.ts + src/timeline/resolve.ts (qa.waive chain), src/cli/commands/{render,preview}.ts + src/compile/plan.ts (`--placeholders`),
structure/qa.md + structure/skills.md NEW.

`--placeholders` (audit blocker 4): render and preview gain boolean option `placeholders`; `compilePlan(resolved, ctx & {placeholders})` turns a
missing file source into a lavfi InputSpec (`testsrc2=s=<layer size>:r=<fps>:d=<span>` for image/video, `anullsrc=r=48000:cl=stereo:d=<span>` for
audio) and adds warning `W_PLACEHOLDER <sourceId>`; without the flag a missing file raises E_NOT_FOUND with fix "pass --placeholders or add the file".
Tests: a fixture with a missing image renders with the flag (warning present) and fails without it (exit 2, E_NOT_FOUND).

## Verification (C for wp7)

`npm test`, `npm run skills:check`; `vid2 skill install --dir /tmp/vid2-skills-test --json` lists 6 skills and a second run reports 0 changed;
`vid2 init launch-30s /tmp/v2t && vid2 render /tmp/v2t/timeline.json --profile proxy --placeholders -o /tmp/v2t/out.mp4 && vid2 qa /tmp/v2t/out.mp4
--timeline /tmp/v2t/timeline.json --json` → ok with artifacts.
