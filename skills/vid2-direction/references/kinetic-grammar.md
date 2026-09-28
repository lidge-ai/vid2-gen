# Kinetic grammar (launch films)

Distilled from a frame-by-frame study of a widely shared 2026 AI-product launch film (87 s, six hard cuts, almost no screen recording).
Use it when a launch or feature video should feel designed rather than assembled. Numbers are starting points.

## Rules

1. **One idea per frame.** One sentence on screen; when it has landed, keep only its key word (magic move) and continue from there.
2. **Words, glyphs and icons are actors.** Build sentences word by word (`kinetic`, `rise`, stagger 0.09–0.12 s, entrance 0.3–0.4 s,
   12–16 px rise, 8–12 px blur). Type into inputs glyph by glyph (30–45 ms). Icons sit in the sentence as nouns (`{globe}`), popping in.
3. **Continuity over cuts.** Prefer states that transform (`kinetic` states, `expand`, `zoomfrom`) to hard cuts; cut only on a musical accent.
   A 50 s film needs fewer than ten cuts.
4. **Accent colour marks attention.** The newest word or glyph arrives in the accent colour and decays in ~0.3 s; on light scenes, a
   reading highlight sweeps grey → ink word by word.
5. **Rebuild the UI.** When the moment is one input, one number or one list, show it as a `field`, `bars`, `ticker` or `chips` at full
   vector sharpness. Keep real capture for the proof shot, inside a `window`, with event-driven camera.
6. **The camera never rests.** Slow pushes (≈ 3 %/s) on stills and backdrops, pans that follow the newest token, zooms into the part of
   a capture that matters.
7. **Alternate temperature.** Dark ↔ light every 6–15 s; mark the change with `fadewhite`, `iris` or an `expand` that fills the frame.
8. **Sound follows motion.** Music bed with sections; `audio.autoCues: true` adds typing ticks, pops, clicks, the riser into an expand
   and whooshes on transitions. Master at −14 LUFS.

## Recipes

| Moment | Layers |
|---|---|
| Hook: the first action | `field` with `grow`, `accent`, `cursor` (click), typing 40 ms per glyph |
| Pain → one word | `kinetic` state 1 = full sentence with icons, state 2 = the surviving word(s) |
| "Introducing" → app opens | `kinetic` with the app icon as an `image` token, next state `expand` to the frame with a fill, then a cut |
| Brand reveal | backdrop still (camera push) + `kinetic` `blur` entrance at 200+ px, `fadewhite` out |
| Promise | light scene, `kinetic` with `highlight`, three short lines |
| Capabilities | `ticker` with a prefix ("It can …") and icons, 0.55–0.65 s per item |
| Parallel work | `chips` with a `connector` beside a real capture window |
| The number | `bars` with one highlighted row, count-up, a claim you can defend |
| Gallery → one result | media `window` grid, `zoomfrom` with the tile's rect into the full-frame result |
| Privacy | `kinetic` `scramble` on the key word, `field` `mask` on a secret |
| End card | icon + name (`kinetic`), install command typed in a mono `field` |

## Checks before final render

- 10 fps strips of every shot: each shot shows its intended technique; nothing overlaps while words exit.
- `vid2 qa --expect-audio`: no open contrast or title-safe issues (stage text is included), −14 ±1 LUFS.
- Consecutive frames of typing shots: one or two new glyphs per frame, never a gap longer than two frames.
