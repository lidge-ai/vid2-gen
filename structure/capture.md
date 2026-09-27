# Capture

`vid2 capture …` records real product footage **and** a log of what happened, so edits can follow the story (zoom on the click,
play a click sound on the click, cut when the page loads) instead of guessed timestamps. Pixels are a layer under the action log.

## Session format

A capture is a directory `<name>.vid2cap/`:

| File | Contents |
|---|---|
| `session.json` | surface (web, electron, native, terminal), fps, footage size, clock origin `t0 = {epochMs, monoNs}`, tool versions, `recordedText`, warnings |
| `actions.jsonl` | one action per line: `{id, seq, kind, label?, tMs, endMs?, frame, point?, bbox?, chars?, text?, key?, source}` |
| `frames.jsonl` | raw screencast frames `{n, tMs, w, h}` (web/electron) |
| `footage.mp4` | constant frame rate H.264, yuv420p, TV range |

`tMs` is milliseconds since `t0` at the moment the input is dispatched; `frame` is the footage frame of that instant
(`round(tMs/1000 × fps)`, the same rounding the quantizer uses, so an action and the frame shown at that instant agree). Coordinates are
footage pixels. Kinds: goto, click, type, press, scroll, hover, drag, mark, input.

**Privacy.** Typed text is redacted by default: the log keeps the kind, label, timing, box and `chars` (length). `--record-text` stores the text
and sets `recordedText: true`; `vid2 capture inspect` warns before such a session is shared. Native input hooks log key codes, never text.

## Surfaces

| Command | Engine | Status |
|---|---|---|
| `capture web --steps flow.json --serve dir|--url U` | Playwright Chromium + CDP screencast, forced device scale, decoded-geometry check | stable |
| `capture web --script flow.mjs` | same, driven by `export default async (v2) => {}` with `v2.click/type/press/mark/wait` | stable |
| `capture electron --app path` | Playwright `_electron` + the same steps runner | experimental |
| `capture native [--display N|--window re|--region]` | ffmpeg avfoundation (macOS), ddagrab→gdigrab (Windows), x11grab (Linux) | macOS tested; others experimental |
| `capture terminal --tape t.tape|--cast c.cast` | VHS or asciinema+agg (must be installed) | experimental |
| `capture devices`, `capture inspect <s>`, `capture mark <s> <label>` | device list, session summary, add a mark from another shell | stable |

Steps are validated against `vid2 schema --steps --json`: `goto, click, type, press, hover, scroll, wait, waitFor, mark, eval`.
Web frames come from CDP `Page.startScreencast` (Playwright's recordVideo has the wrong timing); each frame's `metadata.timestamp` is converted
to the session clock (receive time when absent) and the variable-rate frames are quantized to constant-rate footage.

Native notes: the macOS screen index comes from `ffmpeg -f avfoundation -list_devices` ("Capture screen N"); `--display N` means screen N.
Screen Recording permission belongs to the terminal or IDE running vid2. `E_ACCESS` is reported only for permission-specific errors; other
device failures are `E_CAPABILITY` with the ffmpeg message; an all-black recording is a warning. Wayland is not supported (x11grab only).
Global input logging (`--events`) needs `uiohook-napi` installed separately (`npm i -g uiohook-napi`); without it capture still works with marks.

## Using a capture in a timeline

```json
{ "sources": { "app": { "type": "capture", "session": "demo.vid2cap" } },
  "scenes": [{ "id": "demo", "duration": "6s", "layers": [
    { "type": "media", "source": "app", "in": { "event": "goto#1", "offset": "0.3s" },
      "camera": { "auto": "events" }, "cursor": { "style": "arrow" } } ] }],
  "audio": { "cues": [{ "at": { "event": "buy" }, "sfx": "click" }] } }
```

Event references name an action by label, id or `kind#k` (1-based). **Clock rule:** the first media layer using a capture source places it on the
timeline: `timeline frame = layer start + round((footage seconds − in) / speed × fps)`. The layer's own `in/out` events are read on the footage clock;
every other event reference (cues, markers of other layers) on the timeline clock. `source` may be omitted when there is one capture.

`camera: {auto: "events"}` plans zoom and focus from the actions (merged groups frame the union of their targets, spring-smoothed, never
leaving the frame) and feeds the same sub-pixel perspective camera as manual keys. `cursor` draws a synthetic arrow or dot that follows the
actions with spring motion, shrinks on click and emits ripples, drawn after the camera so it stays sharp. Footage shorter than its layer holds the
last frame.
