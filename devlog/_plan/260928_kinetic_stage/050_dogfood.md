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
| 4 | 7.8–9.8 | "Introducing" over a dock of three icons; the ima2 icon (ima2-generated) expands to fill the frame | `kinetic` + `expand` | 18–19 dock icon opens |
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
