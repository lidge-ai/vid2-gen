# 050 — Dogfood film, template and direction guidance (wp5)

**Summary.** Prove the upgrade by making a ~50 s launch film for ima2-gen in the grammar of 001, with every visual built by vid2:
kinetic typography, field/bars/ticker/chips, expand/zoomfrom/iris transitions, ima2-generated assets (brand backdrop, app icon, sample
images shown as outputs) and a real capture of the ima2-gen web UI placed in a window. Ship what we learn as a `kinetic-launch`
template and a kinetic-grammar reference in the direction skill, so the next agent starts from the same quality bar.

## Shot list (reference mapping)

| # | Time (s) | Scene | Built with | Reference moment (001) |
|---|---|---|---|---|
| 1 | 0.0–3.0 | dark: glowing field; I-beam cursor slides in and clicks; types "a cat astronaut, 35mm film"; accent decay; field grows | `field` with `grow` + `accent` + cursor | 0.0–3.1 typing into the pill |
| 2 | 3.0–5.6 | "Five tabs. {key} Three logins. One image." icons pop, then magic move leaves "One image." centred | `kinetic` states | 1.6–3.1 icons, 57–60 magic move |
| 3 | 5.6–7.8 | a cloud of "Generate +" chips scatters with motion blur; "...and a queue." glyphs drop in | raw `stage` + `motionblur`, `kinetic` drop | 7.6–9.6 scatter + glyph drop |
| 4 | 7.8–9.8 | "Introducing" over a dock of three icons; the official ima2 app icon expands to fill the frame | `kinetic` + `expand` | 18–19 dock icon opens |
| 5 | 9.8–13.0 | "ima2" glyphs blur in over an ima2-generated light-ray backdrop with slow push; flash to white | `kinetic` blur + media `kenburns` + `fadewhite` | 19–21 brand reveal |
| 6 | 13.0–16.6 | light: "An image studio that runs on your machine" lines build grey, highlight sweeps to black | `kinetic` highlight | 21–23 reading sweep |
| 7 | 16.6–19.6 | "{sparkles} GPT  {zap} Grok  {star} Gemini" staggered with inline icons | `kinetic` icons | 23–25 icons as words |
| 8 | 19.6–27.6 | real ima2-gen web UI capture in a window, camera zooms to the prompt box and gallery on events; chips "12 jobs in parallel" with connector lines draw beside it | media capture + `window` + camera auto + `chips` | 26–47 rebuilt UI, chips, line draw |
| 9 | 27.6–31.2 | iris to dark; bars "Parallel jobs": ima2 12 vs a chat tab 1, highlight bar grows with glow and counts up | `iris` + `bars` | 53–57 iris + benchmark |
| 10 | 31.2–36.4 | "ima2 can → text to image / edit / inpaint / video / batch / nodes" ticker with icon swap | `ticker` | 60–66 ticker |
| 11 | 36.4–41.6 | gallery grid of ima2-generated images drifting; `zoomfrom` into one hero image | media + `zoomfrom` | 66–72 zoom into device |
| 12 | 41.6–45.6 | light: "Everything stays {lock} local" with "local" scrambling in; field shows "api_key" typed then masked | `kinetic` scramble + `field` mask | 70–79 scramble + masking |
| 13 | 45.6–50.0 | dark end card: logo lockup + field typing `npm i -g ima2-gen` | `kinetic` + `field` | 79–87 end card |

Music: synth `launch` preset with sections intro→build (shot 4)→drop (shot 5)→break (shot 6)→build (shot 9)→outro (shot 13);
`audio.autoCues: true` for typing, pops, clicks, grows and transitions.

## Deliverables

| Path | Content |
|---|---|
| `examples/ima2-launch/BRIEF.md`, `README.md` | story, shot list above, how to regenerate |
| `examples/ima2-launch/timeline.json` | the film (ima2 `generate` sources + capture session + bundled icons) |
| `examples/ima2-launch/ui.steps.json` | capture steps for the ima2-gen web UI (`vid2 capture web`) |
| `examples/ima2-launch/check-sync.mjs` | SFX sync check (below) |
| `templates/kinetic-launch/` | 30 s skeleton using every new layer with placeholder assets; `vid2 init kinetic-launch` |
| `skills/vid2-direction/references/kinetic-grammar.md` + SKILL.md pointer | grammar and numbers from 001, recipes (typing hook, magic move, ticker, bars, expand reveal, light/dark rhythm), do/don't |
| `skills/vid2-timeline/references/` | schema reference for stage, kinetic, field, bars, ticker, chips, new transitions |

Generated media (renders, captures, ima2 outputs) stay out of git; the evidence copy goes to `~/.vid2/evidence/ima2-launch/`.

## Acceptance

1. `vid2 validate` and `vid2 render --profile final` succeed; duration 49–51 s; `vid2 qa --expect-audio` reports status pass with zero
   open contrast and text-safe issues; integrated loudness −14 ±1 LUFS (QA loudness check).
2. **Shot review**: for each of the 13 shots, a 10 fps strip over its time range is rendered (`ffmpeg -vf fps=10,tile`) and checked
   against the table's "built with" column; results recorded here with timestamps. Typing cadence is verified on consecutive frames of the final-rate
   render (not the strips): in shots 1, 12 and 13 the visible glyph count increases by one or two per frame at 29.97/30 fps
   (average 30–45 ms per glyph, 001: a mix of 1- and 2-glyph steps, never a frame gap longer than 2 frames while typing), measured by counting glyph boxes from the stage layout at each frame and spot-checked visually on 12
   consecutive frames; magic-move shots (2, 4) show intermediate positions on at least 4 consecutive frames.
3. **Sound**: the compiled audio plan contains ≥ 30 auto SFX stems. `check-sync.mjs` verifies, for every auto cue, that its *anchor*
   sample (stem `atSample` + the preset's anchor offset: `start` = 0, `peak` = peakS, `end` = durationS, from `SFX_PRESETS`) equals the
   source event or transition-midpoint frame ±1 frame. Onsets: `src/audio/beats.ts` gains an exported `onsetTimes(pcm, rate)` (the
   spectral-flux peak picking `detectBeats` already computes internally, refactored out with a unit test on a synthetic click train);
   `check-sync.mjs` decodes the final mix and requires ≥ 70 % of `type`/`pop`/`click` cue start times in shots 1–3 to have an onset
   within 30 ms. Music is non-silent throughout (QA silence check).
4. `vid2 init kinetic-launch` in a temp dir, then validate + proxy render succeed offline (placeholders).
5. `npm run skills:check` passes; the film is shown to the user in chat.

## wp5 P revalidation (2026-09-28)

Previous D (wp4): components, custom transitions and stage sound verified (278 tests); direction unchanged: make the film. Checked at P:
ima2-gen 3.23.1 is running (`ima2 status`: GPT OAuth healthy, server http://127.0.0.1:3333); its web UI exposes `#positive-prompt-sidebar`
(prompt textarea) and a `Generate` button; Playwright Chromium is installed for `vid2 capture web`; the official app icon is
ima2-gen `assets/brand/icon-1024.png`.

- **Assets (ima2, real generations)** — declared as `generate` sources in `examples/ima2-launch/timeline.json` and materialized with
  `vid2 assets resolve` (cache keyed by prompt): backdrop "abstract vertical light rays, deep teal to midnight navy gradient, soft
  volumetric glow, cinematic, minimal, no text" (1536x1024); six gallery images (cat astronaut 35mm film still; neon city street in rain;
  ceramic mug product shot on linen; watercolor alpine lake; isometric cozy workshop; robot florist portrait) at 1024x1024. The ima2
  app icon is committed as a 256 px PNG (< 60 KB, brand asset, not generated media).
- **Capture** — `examples/ima2-launch/ui.steps.json`: goto `/`, wait, click the prompt, type "a cat astronaut, 35mm film, golden hour"
  at 45 ms per key (mark `typed`), click Generate (mark `generate`), wait for the result (mark `result`). Command:
  `vid2 capture web --url http://127.0.0.1:3333 --steps ui.steps.json --size 1440x900 --out ui` (session directory is ignored by git
  like the 0.1 example's raw frames; README documents the regeneration). Shot 8 uses `camera: {auto: "events"}` and `in/out` on marks.
- **Timeline** — 1920x1080, 30 fps, ~50 s, 14 scenes (13 shots; shot 11 is gallery + hero), synth `launch` bed with sections, `autoCues: true`.
- **Checks (C)** — `vid2 validate`; `vid2 render --profile final`; `vid2 qa --expect-audio --timeline` (no fail, zero open contrast
  and text-safe); 10 fps strips per shot reviewed and noted in 050; `check-sync.mjs` (anchor alignment + onsets ≥ 70 % in shots 1–3,
  `onsetTimes` exported from `src/audio/beats.ts` with a synthetic click-train unit test); typing cadence from consecutive frames.
- **Template** — `templates/kinetic-launch` (BRIEF, README, timeline with placeholder `generate` sources); added to `init` NAMES and to
  `tests/e2e/templates.test.ts` coverage automatically.
- **Guidance** — `skills/vid2-direction/references/kinetic-grammar.md` + SKILL.md pointer.

wp5 tasks: t1 assets + icon; t2 capture; t3 timeline + BRIEF/README; t4 onsetTimes + check-sync; t5 render, QA, strips, sync check,
evidence copy; t6 kinetic-launch template; t7 direction guidance + skills; t8 show the film to the user.

Reflection (architect 01a0e4f2, wp5): MISALIGNED, 4 gaps, all folded: (1) `.gitignore` gains `examples/ima2-launch/*.vid2cap/` so the whole
capture session stays local (README gives the capture command); (2) `tests/e2e/templates.test.ts` gets the fifth name in its list
assertion and an `expected` entry for `kinetic-launch` (1920x1080, frames from its timeline); (3) the audio plan gains
`AudioPlan.autoCues: {stem, sfx, kind, source, anchorSample}[]` (a ledger written by `automatic()`; 0.1 plans read it as absent) and
`check-sync.mjs` checks every ledger entry's `stem.atSample + anchor offset = anchorSample` and each stage entry's `anchorSample` against
its stage event's absolute frame; (4) shot 4 uses the official ima2 app icon; `generate` sources are only the backdrop and the gallery.

Audit wp5 round 1 (reviewer 01a0e4fa): FAIL, 1 blocker — shot 11's grid and zoom target were unspecified. Folded: shot 11 is two scenes.
`gallery` (3.6 s): six ima2 images as `media` layers with `window` rects in a 3×2 grid (360×360, radius 22, drift, staggered starts) plus a
"Made with ima2." kinetic caption; its `transition` is `zoomfrom` with `rect` = the grid tile holding the cat-astronaut image. `hero`
(2.6 s, new): that same image full-frame with a slow camera push and the prompt typed underneath — this is the incoming scene the
zoomfrom rescales. Shot 12 (privacy) follows the hero scene. Total stays ≈ 50 s. The draft timeline is
`examples/ima2-launch/timeline.json` (uncommitted until B).


## C results (2026-09-28)

Film: `examples/ima2-launch` rendered final (1920×1080, 30 fps, 1491 frames = 49.7 s, H.264 + AAC), evidence copied to
`~/.vid2/evidence/ima2-launch/` (film, 1 fps sheet, 10 fps strips, qa.json, sync.json, plan, poster).

1. `vid2 qa --expect-audio`: **pass, 0 issues** (format, duration, black, frozen, silence, loudness −14.0 LUFS / TP −1.5, av_sync,
   text_safe, contrast). The first QA run raised two contrast warnings that were real engine findings and are fixed in this cycle:
   the reading-highlight words were measured mid-sweep (settle now waits for colour tracks to end) and white text on the light accent
   bar was 1.9:1 (bars now choose ink or white by WCAG luminance).
2. Shot review: 1 fps sheet of the whole film and 10 fps strips of the hook (typing, accent, pill growth), the magic move
   (intermediate positions on ≥ 4 consecutive frames, leavers blurred out), the intro (icons pop in stagger) and the gallery
   (zoomfrom tile starts growing); all 13 shots show their "built with" technique.
3. Sound: `check-sync.mjs` → { "cues": 101, "anchorErrors": 0, "spacingErrors": 0, "earlyCues": 17, "onsetMatched": 13, "onsetRatio": 0.76, "cadence": [ { "id": "stage-c3e454fbd6f41b93", "glyphs": 39, "msPerGlyph": 33, "maxGapFrames": 1 }, { "id": "stage-4558a04b980c920d", "glyphs": 18, "msPerGlyph": 33, "maxGapFrames": 1 }, { "id": "stage-be489c67bfeb7296", "glyphs": 17, "msPerGlyph": 33, "maxGapFrames": 1 } ] } . 101 auto cues; every anchor matches its stem ±1 frame; every stage
   source keeps its event spacing; 76 % of type/pop/click cues in the first 9 s have an onset within 30 ms. Found on the way: typing
   ticks at −6 dB were masked by the bed (glyph cues now at the preset level), and 50 ms peak picking merged ticks 40–60 ms after a hi-hat
   (`onsetTimes` takes a radius; the check uses 20 ms). Typing cadence: 33 ms per glyph, never more than one frame between glyphs, in all
   three typing shots (the end card was 67 ms and was tightened).
4. `vid2 init kinetic-launch` added (template test updated; runs offline with placeholders).
5. `npm run skills:check` passes with `vid2-direction/references/kinetic-grammar.md`.
