# 020 — Kinetic typography preset (wp3)

**Summary.** A `kinetic` layer compiles a sequence of text states into stage nodes: words, glyphs and icons are keyed tokens that
enter with staggered entrances, survive state changes by moving to their new layout on a spring (magic move), and exit with blur.
Optional accent decay, reading highlight, scramble, a resizing container pill and a camera that follows the newest token cover the
typographic techniques in 001. A bundled stroke-icon set makes `{globe}` usable without any asset.

## Authored shape

```json
{ "type": "kinetic", "start": "0s",
  "x": 960, "y": 540, "align": "center", "size": 84, "font": "sans", "weight": "semibold",
  "color": "#F5F5F2", "accent": { "color": "#5AC8FA", "decay": "0.3s" },
  "enter": { "style": "rise", "duration": "0.38s", "stagger": "0.11s", "glyphStagger": "0.035s" },
  "exit": { "style": "blur", "duration": "0.25s" },
  "move": { "stiffness": 170, "damping": 22 },
  "states": [
    { "at": "0s", "text": "Anything you can do in a {globe} browser" },
    { "at": "2.2s", "text": "{globe} browser" } ],
  "pill": { "fill": "#1C1C1ECC", "stroke": "#FFFFFF22", "radius": 999, "padX": 36, "padY": 20, "glow": "#5AC8FA33" },
  "camera": { "mode": "follow", "width": 1400, "margin": 120 },
  "highlight": { "dim": "#8E8E93", "sweep": "0.12s" } }
```

- `text` shorthand tokenizes on spaces; `{name}` is an icon token (built-in icon name, or an `image` source id); `\n` breaks a line.
  A state may instead give `tokens: [{text|icon, key?, color?, accent?}]`. Default key = lowercased text (or icon name) + `#` +
  occurrence index within the state, so repeated words stay distinct and the same word in the next state is the same actor.
- Enter styles: `rise` (12 px rise + 10 px blur + fade), `blur`, `fade`, `pop` (scale 0.6→1 with spring overshoot; default for
  icons), `drop` (per-glyph fall-in), `type` (per-glyph appearance at `glyphStagger`, optional caret), `scramble` (per-glyph random
  glyphs from the font's charset, seeded by key, resolving left to right).
- Exit styles: `blur`, `fade`, `fall`, `none`. Exits start at the next state's `at`; survivors start moving at the same frame.
- `accent`: entering glyphs start at the accent colour and decay to their colour. `highlight`: tokens start at `dim` and switch to full
  colour one by one every `sweep` after the state completes its entrances.
- `pill`: a rect node sized to the laid-out line bounds + padding, width/height/x on the same spring as tokens.
- `camera.follow`: when the laid-out line is wider than `camera.width`, the token group translates so the most recently entered
  token's right edge stays `margin` inside the viewport (springed), like the reference's 1.6–3.1 s pan.
- `expand`: a state may set `"expand": {"token": "<key>", "to": "frame" | {x,y,width,height}, "radius": 0, "fill"?: colour}`. The named
  token (an icon or image token) grows on the move spring from its laid-out box to the target rect while its corner radius animates to
  `radius` and every other token exits; with `fill` the grown box becomes a solid/gradient-free colour plate that the next scene can cut
  or fade from. This is the in-stage "dock icon opens" (reference 18–19 s); the cross-scene `zoomfrom` transition (040) is the
  alternative when the next scene is footage.

## File change map

| File | Change |
|---|---|
| `src/stage/presets/kinetic.ts` (new) | state parsing → token actors → nodes + tracks + events |
| `src/stage/presets/tokens.ts` (new) | tokenizer, key assignment, icon/source lookup |
| `src/stage/layout.ts` (new) | measure (glyph advances + kerning from `glyphs.ts`, icon width = 1.05 × cap height), wrap to `maxWidth`, align, per-glyph offsets |
| `src/stage/presets/entrances.ts` (new) | enter/exit style → track keys |
| `src/stage/icons/lucide.ts` (new) + `assets/icons/LICENSE-lucide.txt` | ~40 ISC-licensed Lucide path strings (globe, lock, key, clock, search, sparkles, image, video, music, mic, wand, zap, check, x, plus, arrow-right, chevron-down, cursor, hand, mail, message, file, folder, layers, palette, camera, film, play, pause, download, upload, cloud, shield, eye, eye-off, user, users, settings, terminal, code, star, heart) |
| `src/stage/icons/path.ts` (new) | SVG path `d` parser (M L H V C S Q T A Z, relative forms, arc→cubic) → polylines |
| `src/timeline/schema.ts` | `KineticLayer` strict object as above; added to `Layer` |
| `src/timeline/validate.ts` | icon names exist or are `image` sources; states sorted by `at` and within the layer span; non-empty text |
| `src/compile/layers/stage.ts` | dispatch kinetic → preset → StageSpec |
| `structure/stage.md`, `skills/vid2-timeline/references/*` | document the layer |

## Acceptance

1. **Magic move**: states "Anything you can do in a {globe} browser" → "{globe} browser" at 2 s. After settle (2 s + 0.6 s) the
   union bbox of non-transparent pixels is horizontally centred on x ±3 px; at 2 s + 0.15 s the "browser" token is between its old and
   new x; the "anything" token's pixels have alpha 0 after the exit duration. (pixel test on the stage clip)
2. **Camera follow**: a 14-word single line with `camera.width: 800`; at every sampled frame the newest entered token's bbox lies within
   the viewport; with `mode: "fixed"` the same frame clips it (control).
3. **Accent decay**: the first glyph's mean colour on its entrance frame is within ΔE 15 of the accent; after `decay` + 2 frames within
   ΔE 5 of `color`.
4. **Icons**: `{globe}` draws stroke pixels inside its token box; `{hero}` referencing an image source draws that image; an unknown name
   fails validation with a path.
5. **Type + scramble**: `type` shows k glyphs at frame round(k × glyphStagger × fps); `scramble` final frame equals the plain text
   render (pixel hash) and an early frame differs.
6. **Pill**: pill bbox width grows monotonically as tokens enter and ends at text width + 2 × padX ±2.
7. **Determinism**: two renders of the same layer produce identical clip frame hashes.
8. **Expand**: a `{globe}` token expanded to `frame` over 0.5 s covers ≥ 99 % of the canvas with non-zero alpha after settle and its
   bbox area grows monotonically across sampled frames.
