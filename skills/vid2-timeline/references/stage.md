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
