# Kinetic grammar (launch films)

Use this vocabulary for launch and feature films built from text, rebuilt UI and proof shots. The recipes are style options; numbers are starting points. See [motion guidance and primary production references](motion.md) for timing, spacing and the limits of the source observations.

## Direction choices

1. **One idea per frame.** One sentence on screen; when it has landed, keep only its key word (magic move) and continue from there.
2. **Words, glyphs and icons are actors.** Build sentences word by word (`kinetic`, `rise`, stagger 0.09–0.12 s, entrance 0.3–0.4 s,
   12–16 px rise, 8–12 px blur). Type into inputs glyph by glyph (30–45 ms). Icons sit in the sentence as nouns (`{globe}`), popping in.
3. **Continuity and cuts.** Transform states (`kinetic` states, `expand`, `zoomfrom`) when an idea continues; retain the same token key and text for a word that should survive reflow. Hard cuts can mark a new claim or musical accent. Choose cut density for the story and pace.
4. **Accent colour marks attention.** The newest word or glyph arrives in the accent colour and decays in ~0.3 s; on light scenes, a
   reading highlight sweeps grey → ink word by word.
5. **Rebuild the UI.** When the moment is one input, one number or one list, show it as a `field`, `bars`, `ticker` or `chips` at full
   vector sharpness. Keep real capture for the proof shot, inside a `window`, with event-driven camera.
6. **Give the camera a purpose.** A slow push (≈ 3 %/s), a pan following a token or a zoom into evidence can direct attention. Rest the camera when a phrase needs reading time or local motion already tells the story. A fixed camera is a deliberate option.
7. **Alternate temperature when useful.** Dark ↔ light every 6–15 s is one launch-film rhythm; `fadewhite`, `iris` or an `expand` can mark it. A consistent palette also works when continuity matters.
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

- Budget entrance, reading hold and exit separately. Include the last staggered word and accent decay before calling a phrase readable. Reserve the final and reflow layouts, then inspect departing actors as the retained word moves. Field centers and bar-stack origins differ; use the [preset spacing guide](motion.md).
- Derive typing cadence from FPS: retain the unrounded glyph interval, then round each cumulative onset after the start anchor has been quantized. A 45 ms interval yields 1.35 frames at 30 fps and 2.7 at 60 fps. Unequal gaps are expected; a slower pause may be intentional. Compare consecutive output frames with those expected onsets, including spaces that consume an interval.
- Use sparse strips for shot coverage, then exact event±1 frames and reading holds. Inspect consecutive frames around typing and reflow, and play the encoded video for rhythm. A 10 fps strip can miss short overlaps and cannot prove that words never collide.
- Run `vid2 qa film.mp4 --timeline timeline.json --json`. Add `--expect-audio` when sound is intended; for a −14 LUFS target, inspect measured loudness against −14 ±1 LUFS. Resolve or explain contrast and title-safe warnings even when the command exits 0. Stage text checks sample the first eligible opaque hold after color animation, not every state or the full movement path; they do not certify geometry has settled or all later text remains readable.

For a reproducible silent exercise, use `motion-study` (`vid2 example show motion-study`): 45 ms field typing, staggered bars and a retained word moving into a new layout, with explicit frame checkpoints and reading holds. Its spacing and timing are original design choices, not measurements taken from a reference film. Keep sound-driven, capture-led and more energetic recipes available when the brief calls for them.
