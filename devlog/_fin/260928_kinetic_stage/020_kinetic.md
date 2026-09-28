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

## wp3 P revalidation (2026-09-28)

Previous D (wp2): the stage primitive is verified (257 tests, implementation review PASS after two FAIL rounds); direction unchanged:
build the kinetic preset on it. A smoke render of a draft preset (`/tmp/vid2-kin`, three scenes: typing pill with icons, magic move to
"{globe} browser", highlight + scramble on light) matched the reference behaviours and exposed one defect that the plan now fixes
(new tokens overlapped exiting ones). Implementation decisions fixed at P:

- **Module split** (all < 250 lines): `src/timeline/kinetic-schema.ts` (authored layer), `src/timeline/validate-kinetic.ts`,
  `src/stage/presets/{builder,tokens,layout,entrances,kinetic}.ts`, `src/stage/icons/lucide.ts`, `src/compile/layers/kinetic.ts`
  (BuildContext → `KineticConfig` → `SpecBuilder` → `placeStage`). `SpecBuilder` takes seconds and authored px and converts once
  (stage frames at fps × rate, px × profile scale), so presets never see the profile.
- **Actors**: a token key names an actor across consecutive states; it springs (`move`) to its new layout box at the state time; a key
  that leaves and returns later is a new actor. New tokens of a later state wait `exit.duration` when anything exits in that state
  (0.08 s otherwise) and stagger by `enter.stagger` in reading order.
- **Glyph styles** (`drop`, `type`, `scramble`) put one text node per glyph under the token's group at its kerned advance; `type`
  reveals at `glyphStagger` and emits a `glyph` event every third glyph; `scramble` uses a new renderer-evaluated `TextNode.scramble
  {chars, from, until, step}` (seeded characters every 2 stage frames until the glyph resolves) — text content is not a keyframed prop.
- **Pill** is a rect in the token group, keyed at every entrance and state time to the extent of on-screen tokens (+padX/padY) on the
  move spring. **Camera follow** keys the token group's x so the newest token's right edge stays `margin` inside
  `x + camera.width/2`; it returns to 0 at a state whose tokens all fit.
- **Expand** adds a top-level plate (the icon's image, or a `fill` rect) at the token's on-screen box (camera offset included) that
  springs to the target rect and radius while the token itself hides; event `grow`.
- **Icons**: 58 Lucide icons (ISC; `assets/icons/LICENSE-lucide.txt`, added to `package.json` `files`) converted to path data; names
  are listed by `vid2 capabilities` (new `icons` field). An icon token may instead name an `image` source.
- **Layering note**: `src/timeline/validate-kinetic.ts` imports the dependency-free `stage/presets/tokens.ts` and `stage/icons/lucide.ts`
  tables so validation and compilation tokenize identically; recorded in structure/overview.md.
- **Schema**: `glyphStagger` accepts seconds or frames and is kept sub-frame (not rounded to the output grid).

wp3 tasks: t1 preset + builder + schema + compile wiring; t2 icons + capabilities + packaging; t3 validation; t4 tests for 020
acceptance 1–8 (+ exit/enter non-overlap); t5 structure/stage.md + skills timeline reference (kinetic section) + structure/overview.md.

Reflection (architect 01a0e4f2, wp3): MISALIGNED, 6 gaps, all folded into the draft and this plan: (1) returning keys keep a live-key map
plus unique actor ids (test: leave → return → survive); (2) duplicate token keys within one state are a validation issue; (3) the camera
starts moving 0.15 s before the token that needs it and uses a critically damped spring — acceptance 2 is measured once the camera
has settled (token appear + 0.35 s), and the control case is unchanged; (4) pill, camera and plate geometry use the move stiffness
with damping raised to critical, so pill width is monotonic (acceptance 6 holds by construction and is still tested); (5) expand seeds
the plate from the evaluated layout spring + camera at the expand frame; a built-in icon's group springs to the target centre, scales
and fades while the fill plate fades in over 0.25 s (image tokens become the plate directly); (6) a paint-order regression test pins
the pill (z −1) under tokens (z 0) and the plate (z 10) over both.

Audit wp3 round 1 (reviewer 01a0e4fa): FAIL, 2 plan blockers + 2 draft findings, all folded. Acceptance 1 is measured on a layer
without a pill: the settled ink box of the remaining actors is centred ±3 px, only the survivors remain (box width bound), and the
motion passes through ≥ 4 distinct positions; exits are proven by the survivor-only box. Acceptance 3 samples the first frame whose
glyph coverage is visible (entry + 3 frames at 30 fps) for the accent, and entry + decay + 2 frames for the decayed colour. Draft fixes:
kinetic state order and span are checked on resolved frames (any unit, beats included) in `kineticTimingIssues`; the Lucide conversion
regex skipped digit attributes (`x1`, `y2`) so `<line>` elements became `Mundefined` — regenerated, and `lucide.test.ts` parses every
icon inside the view box.
