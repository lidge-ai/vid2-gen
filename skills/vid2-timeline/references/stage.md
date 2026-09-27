# Stage layers (motion graphics)

Use a stage layer when words, icons or UI pieces must move independently: typed text, magic-move reflow, pills that grow, charts.
It renders in vid2 (pure JS) and composites like any layer. Coordinates are authored pixels of the output; times are relative to the
layer start. Presets (`kinetic`, `field`, `bars`, `ticker`, `chips`) build on the same model; reach for raw `stage` when no preset fits.

```json
{ "type": "stage", "start": "0s", "end": "3s",
  "nodes": [
    { "kind": "rect", "key": "pill", "x": 960, "y": 540, "width": 520, "height": 96, "radius": 48, "fill": "#1C1C1ECC",
      "stroke": "#FFFFFF22", "strokeWidth": 2, "glow": { "color": "#5AC8FA33", "blur": 16 } },
    { "kind": "text", "key": "word", "text": "Ship it", "size": 64, "color": "#F5F5F2", "x": 960, "y": 540, "blur": 10, "opacity": 0 } ],
  "tracks": [
    { "node": "pill", "prop": "width", "keys": [ { "at": "0s", "value": 120 }, { "at": "0.2s", "value": 520, "ease": "spring" } ] },
    { "node": "word", "prop": "opacity", "keys": [ { "at": "0.3s", "value": 0 }, { "at": "0.65s", "value": 1, "ease": "out" } ] },
    { "node": "word", "prop": "blur", "keys": [ { "at": "0.3s", "value": 10 }, { "at": "0.65s", "value": 0, "ease": "out" } ] },
    { "node": "word", "prop": "color", "keys": [ { "at": "0.3s", "value": "#5AC8FA" }, { "at": "0.6s", "value": "#F5F5F2", "ease": "linear" } ] } ],
  "events": [ { "at": "0.3s", "kind": "token" } ] }
```

- Node kinds: `text` (`text`, `font`, `weight`, `size`, `color`, `letterSpacing`, `reveal`), `image` (`source` = image source id, `width`,
  `height`, `radius`, `fit`), `rect` (`width`, `height`, `radius`, `fill`, `stroke`, `strokeWidth`, `shadow`, `glow`), `group` (`clip`).
  Every node has `key`, optional `parent` (a group key), `x`, `y`, `anchorX`/`anchorY` (0..1 of its own box, default centre), `scale`,
  `scaleX`, `scaleY`, `rotation`, `opacity`, `blur`, `z`.
- Track props: `x y scale scaleX scaleY rotation opacity blur` for all; `color reveal` for text; `width height radius` for rect/image;
  `fill stroke strokeWidth` for rect. Colour values are hex strings, everything else numbers.
- Eases: `linear in out inout punch hold` reach the value at the key; `spring` releases at the key and settles afterwards
  (`"spring": {"stiffness":170,"damping":22,"mass":1}`; lower damping overshoots more). A spring as the first key starts from the
  node's own property.
- Good defaults for launch-film motion: entrances 0.3–0.4 s `out` with 8–16 px rise and 6–12 px blur; exits 0.2–0.3 s; springs
  stiffness 170, damping 20–24 for layout moves, damping 14 for playful pops.

## Kinetic typography

`kinetic` builds typographic motion from states: each state is the full line on screen at that moment.

```json
{ "type": "kinetic", "x": 960, "y": 540, "size": 84, "maxWidth": 1300,
  "accent": { "color": "#5AC8FA", "decay": "0.3s" },
  "enter": { "style": "rise", "duration": "0.38s", "stagger": "0.11s" },
  "states": [
    { "at": "0s", "text": "Anything you can do in a {globe} browser" },
    { "at": "2.2s", "text": "{globe} browser" } ] }
```

- Words shared by consecutive states glide to their new place; words missing from the next state exit (`exit.style`: `blur fade fall
  none`); new words enter (`enter.style`: `rise blur fade pop none` per word, `type drop scramble` per glyph with `glyphStagger`).
- `{name}` inserts an icon as a word: built-in names from `vid2 capabilities --json` (`icons`), or an `image` source id (app icons from
  ima2). Use `tokens: [{ "text": "encrypted", "enter": "scramble" }, { "icon": "lock" }]` for per-token control or explicit `key`s.
- Typing into a search pill: `"enter": {"style":"type"}`, `"pill": {"fill":"#1C1C1ECC","stroke":"#FFFFFF22","glow":"#5AC8FA33"}`,
  `"camera": {"mode":"follow","width":1400}` so a long line pans instead of overflowing.
- Reading highlight on light scenes: `"color":"#1C1C1E","highlight":{"dim":"#C7C7CC","sweep":"0.12s"}`.
- App-opens reveal: a state with `"expand": {"token":"icon:app#0","to":"frame"}` grows that icon (image source) to full frame; cut or fade
  to the next scene when it covers the frame.

## UI components

```json
{ "type": "field", "x": 960, "y": 540, "width": 520, "grow": { "maxWidth": 1300 }, "placeholder": "Describe an image…",
  "accent": {}, "cursor": { "from": { "x": 1500, "y": 900 }, "at": "0.7s", "click": "0.8s" },
  "typing": [ { "at": "1s", "text": "a cat astronaut, 35mm film" } ], "mask": { "at": "3s" } }
{ "type": "bars", "x": 360, "y": 380, "width": 1000, "max": 12, "unit": "", "delay": "0.2s",
  "items": [ { "label": "ima2", "note": "12 parallel", "value": 12, "highlight": true }, { "label": "Chat tab", "value": 1 } ] }
{ "type": "ticker", "x": 520, "y": 540, "prefix": "ima2 can", "items": [ { "text": "text to image", "icon": "image" }, { "text": "edit", "icon": "wand" } ] }
{ "type": "chips", "x": 900, "y": 300, "connector": { "from": { "x": 600, "y": 540 } },
  "items": [ { "at": "0.4s", "text": "Spawned job", "icon": "sparkles", "note": "cat astronaut" } ] }
```

`theme` is `dark` (default) or `light`; `style` overrides colours. Bars and ticker use `delay` (relative to the layer start) because
`start` is the layer span. Rebuild real UI with these instead of screen-recording it when the moment is about one input, one number or
one list; keep real capture for proof shots.

## Transitions that feel like the app opening

- `{ "type": "zoomfrom", "duration": "0.6s", "rect": { "x": 900, "y": 480, "width": 120, "height": 120, "radius": 28 } }` grows the next
  scene out of that rect (for example the app icon's position in the previous scene); the next scene is rescaled into it.
- `{ "type": "iris", "duration": "0.5s", "center": { "x": 960, "y": 540 } }` opens a circle from a point.
- With `audio.autoCues: true` every non-cut transition gets a whoosh, and stage events add typing ticks, pops, clicks, a riser that ends
  when an expand fills the frame, and a swoosh when three or more words move. Authored cues within 80 ms win.
