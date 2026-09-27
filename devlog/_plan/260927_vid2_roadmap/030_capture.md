# 030 — wp4 Capture (action log, web/Electron/native/terminal, auto camera, synthetic cursor)

Consumes 010/020. Research: 002 (prototype lessons), 004_capture_research.md (digest of Aside 020-capture.md). ARCH-06.
Design principle (from research): the **agent's action log is the source of truth**; pixels are a layer under it. Capture
hides the OS cursor where possible; cursor, click ripples and camera moves are re-rendered deterministically by the compiler.
Algorithms follow the documented behaviour of Cap (AGPL) and Screen Studio as references only; vid2 implements its own code.

## Scope

IN: capture session format; frame quantization (VFR → CFR) with shared event mapping; web capture driven by a declarative
steps file or a JS module (Playwright + CDP screencast, forced device scale factor, geometry assertion); Electron capture
(Playwright `_electron`, experimental); native display/window capture via ffmpeg devices (macOS avfoundation stable; Windows
ddagrab→gdigrab, Linux x11grab experimental) with optional global input logging (`uiohook-napi`); terminal capture from VHS
tapes or asciinema casts (experimental, needs `vhs` or `agg` installed); EventResolver for timeline EventRefs; auto camera
(`camera: {auto: "events"}`) and synthetic cursor/ripples in the media layer; `vid2 capture <web|electron|native|terminal>`,
`vid2 capture devices`, `vid2 capture inspect <session>`.
OUT: macOS ScreenCaptureKit helper binary (listed as future work; avfoundation is enough for 0.1), Wayland (documented unsupported),
Windows gfxcapture (requires ffmpeg >= 8.1; detected and used when present, otherwise ddagrab).

## Session format (src/capture/session.ts) — public, documented in structure/capture.md

Directory `<name>.vid2cap/`:
- `session.json`: `{version: 1, surface: "web"|"electron"|"native"|"terminal", fps: "30", width, height, scale (capture px per logical px),
  t0: {epochMs, monoNs}, footage: "footage.mp4", frames: "frames.jsonl" | null, actions: "actions.jsonl", cursorHidden: boolean,
  tool: {vid2, ffmpeg, playwright?}, platform, createdAt}`
- `actions.jsonl`: one per line `{id: string, seq: number, kind: "goto"|"click"|"type"|"press"|"scroll"|"hover"|"drag"|"mark"|"input",
  label?: string, tMs: number (ms since t0, monotonic), frame: number (footage frame index, filled at finalize), point?: {x,y} (footage px),
  bbox?: {x,y,width,height} (footage px), text?: string (only with --record-text), chars?: number, source: "agent"|"hook"}`.
  Privacy (reflection gap 4): typed text is **redacted by default** — the log keeps kind, label, timing, bbox and `chars` (length) so camera,
  cursor and typing SFX still work; the literal text is stored only when the capture runs with `--record-text`. Native hooks never log text,
  only key codes. `vid2 capture inspect` warns if a session contains recorded text before it is shared.
- `frames.jsonl` (web/electron raw): `{n, tMs, w, h}`; `footage.mp4`: CFR H.264 yuv420p TV range at session fps, cursor hidden when possible.
- EventRef resolution (resolver.ts): `{event: "<label>" | "<id>" | "<kind>#<k>"}` → action → frame; `offset` applied in frames.

## Quantizer (src/capture/quantize.ts) — ported from prototype make_seq.py

`quantize(frames: {n: number; tMs: number}[], endMs: number, fps: Fps): number[]` returns, for each output frame slot, the source
frame index: source i covers `[slot(t_i), slot(t_{i+1}))` with `slot(t) = round(t/1000 * fps)`; the first slot starts at 0 (clamp).
`mapEventFrame(tMs, fps) = max(0, round(tMs/1000 * fps))` — the same rounding, so events and frames agree. The encoder feeds the
slot list via an image2 sequence of hard links (fallback: copy on filesystems without links, e.g. some Windows volumes):
`ffmpeg -framerate <fps> -i seq/%06d.jpg -c:v libx264 -crf 14 -pix_fmt yuv420p -vf scale=out_range=tv`.
Tests: synthetic timestamps with gaps; total slots = round(endMs*fps); events land on the slot of the frame visible at that time.

## Web capture (src/capture/web.ts)

`vid2 capture web --steps flow.json | --script flow.mjs [--url U | --serve <dir>] [--size 1440x900] [--scale 2] [--fps 30] [--out name.vid2cap]`.
`--serve <dir>` starts a node:http static server on 127.0.0.1 with a random free port for the capture's lifetime and sets the base URL, so
relative `goto` paths in steps work (used by the e2e fixture and by 070's code-page fallback).
Launch: `playwright-core` chromium (channel from `--browser chromium|chrome|msedge`, headless by default, `--headed` opt),
args `--window-size=<w>,<h+chromeHeight>` and `--force-device-scale-factor=<scale>`, context `viewport: null`, locale en-US,
colorScheme from flag. chromeHeight is measured once: open about:blank, read `window.outerHeight - innerHeight`, relaunch if the
viewport differs from the requested size (prototype needed 987 for a 900 viewport). CDP `Page.startScreencast({format:"jpeg",
quality:88, maxWidth: w*scale, maxHeight: h*scale})`; ack every frame; write JPEGs + frames.jsonl; after stop, assert the first frame's
decoded size equals (w*scale, h*scale) else fail E_CAPABILITY with the observed size (research: CDP DPR behaviour is build-dependent).
Steps JSON (schema in src/capture/steps.ts, zod, published via `vid2 schema --steps`):
`[{goto: url} | {click: selector, label?} | {type: selector, text, delayMs?, label?} | {press: key} | {hover: selector} |
{scroll: {y}} | {wait: ms | {selector}} | {waitFor: {url?|selector?|response?}} | {mark: label} | {eval: js}]`
The runner records each action: bbox from `locator.boundingBox()` before acting (CSS px × scale → footage px), point = bbox centre,
tMs before and after; `type` records one action (text redacted unless --record-text). JS module mode: `export default async function (v2) {…}` where `v2` exposes
`page`, `click(locator, {label})`, `type`, `press`, `mark`, `wait` wrappers that log identically.
Cursor: headless Chromium draws no cursor, so `cursorHidden: true` always for web.

## Electron (src/capture/electron.ts, experimental)

`vid2 capture electron --app <path-to-app-or-main.js> --steps flow.json`: `_electron.launch({executablePath|args})`, `firstWindow()`,
same steps runner and CDP screencast via `page.context().newCDPSession(page)`; the DPR is whatever the OS gives (no force flag);
geometry is read from the first frame and recorded in session.json.

## Native (src/capture/native.ts + src/capture/input-hook.ts)

`vid2 capture native [--display N | --window "<title regex>"] [--region x,y,w,h] [--fps 30] [--duration S | until Ctrl+C/--stop-file F]
[--events] [--cursor show|hide]`.
Backends chosen by probe: macOS `-f avfoundation -framerate F -capture_cursor 0|1 -pixel_format bgr0 -i "<screenIndex>:none"` (screen index
from `-list_devices` parsing "Capture screen N"; window capture = region crop of the window bounds obtained via
`osascript -e 'tell application "System Events" …'` best-effort); Windows `-f lavfi -i ddagrab=output_idx=N:framerate=F:draw_mouse=0,hwdownload,format=bgra`
(fallback `-f gdigrab -framerate F -draw_mouse 0 -i desktop|title=…`), `gfxcapture` when present and `--window` is used; Linux
`-f x11grab -framerate F -draw_mouse 0 -video_size WxH -i :0.0+x,y`; Wayland detected via `WAYLAND_DISPLAY` → E_CAPABILITY with guidance.
Encoding while capturing: `-c:v libx264 -preset ultrafast -crf 18` (or hw encoder) to raw.mp4, then normalize to CFR footage.mp4.
Events: `--events` loads `uiohook-napi` dynamically (optionalDependency); logs mousedown/up, mousemove (≤ 60 Hz decimated), keydown
(key code only, never text, for privacy) with `process.hrtime.bigint()`; coordinates converted from global logical points to footage px
using display bounds + scale (macOS scale from `system_profiler SPDisplaysDataType -json` Retina flag or capture size / logical size).
Missing module or permission (macOS Accessibility/Input Monitoring) → warning + `actions.jsonl` with only `mark` events (Ctrl+Alt+M hotkey
when the hook works; `vid2 capture mark <session> <label>` from another shell always works via a marks FIFO/file the recorder tails).
Permission failure detection: first 30 frames all black (signalstats YMAX < 16) → E_ACCESS with per-OS recovery text (macOS: grant Screen
Recording to the terminal/IDE running vid2, restart it).
`vid2 capture devices [--json]` lists screens/windows/audio devices per backend.

## Terminal (src/capture/terminal.ts, experimental)

`vid2 capture terminal --tape demo.tape` runs `vhs` (must be on PATH) with an injected `Output <tmp>.mp4`, parses `Type`/`Enter`/`Sleep`
lines to reconstruct action times (VHS executes at a fixed typing speed `Set TypingSpeed`), normalizes to footage.mp4.
`--cast demo.cast` renders via `agg --fps-cap <fps>` to GIF then ffmpeg to CFR mp4; actions from cast v2 "i" (input) events when
recorded with `--stdin`, else from output bursts marked as "output".

## Auto camera + synthetic cursor (src/capture/camera.ts, src/capture/cursor.ts; consumed by compile/layers/media.ts)

camera.ts: `planCamera(actions, {fps, frames, width, height, zoom?, minScale: 1.15, maxScale: 2.2, pad: 0.12, merge: 0.7s, leadIn: 0.22s,
hold: 0.5s, leadOut: 0.27s}): CameraKey[]`: focus rect = action bbox (or point ± 60 px) padded; scale = clamp(0.45 × W / rect.w, min, max)
unless `zoom` given; actions closer than merge or overlapping rects form one segment; targets change at segment edges; camera state
(zoom, cx, cy) integrated per output frame with a mass-spring-damper (stiffness 200, damping 40, mass 2.25; analytic step, snap below
1e-5/1e-4) and clamped so the crop never leaves the frame; then down-sampled to keys every 2 frames for the perspective-corner expressions of
020 motion.ts (a flat sum of
`between(on,a,b)*lerp` terms, not nested ifs). Unit tests: static action → converges to target within 0.6 s; two far clicks 0.3 s apart
merge; crop stays inside bounds.
cursor.ts: `planCursor(actions, …)` → per-frame cursor position via spring (tension 530, friction 40, mass 1; 500 ms click lookahead,
phase lead friction/tension s), click shrink 0.8 for 130 ms, idle fade after 500 ms over 400 ms; ripples (≤ 6 live) 0.6 s, radius 1.25 × cursor
height. Rendering: cursor PNG (arrow drawn by png.ts at 2× then scaled) and a 24-frame ripple sprite sequence (png.ts rings) overlaid with
per-frame x/y expressions sampled like the camera; cursor/ripples are drawn in output space after the camera crop so they stay sharp.
Field chain (audit blocker 3): `MediaLayer.cursor` and `MediaLayer.camera.auto` → schema.ts (+ regenerated JSON Schema) → resolve.ts
`ResolvedMediaLayer.cursor {style, ripple, scale}` and camera keys produced by planCamera from the capture session's actions within the layer span →
consumers compile/layers/media.ts (camera corners) and compile/layers/cursor overlay → tests: schema parse/unknown key/drift, resolve with a
fixture session, e2e render. MediaLayer schema additions (MODIFY src/timeline/schema.ts; bump nothing — additive, optional):
`cursor: z.strictObject({ style: z.enum(["arrow","dot","none"]).default("arrow"), ripple: z.boolean().default(true), scale: z.number().default(1) }).optional()`.

## File map

NEW src/capture/{session,quantize,resolver,steps,web,electron,native,input-hook,terminal,camera,cursor,devices,spring}.ts, src/capture/index.ts,
src/cli/commands/capture.ts; tests colocated for quantize, resolver, steps, camera, cursor, spring, devices (parser fixtures);
tests/e2e/capture-web.test.ts (Playwright chromium against a local static HTML fixture served by node:http; skipped with clear SKIP when
`playwright-core` browsers are absent unless VID2_REQUIRE_PLAYWRIGHT=1, which CI sets on ubuntu after `npx playwright-core install chromium`);
tests/e2e/capture-native.test.ts (manual/opt-in: VID2_NATIVE_CAPTURE_TEST=1, records 2 s of display 0 and checks frames/geometry).
MODIFY .github/workflows/ci.yml (audit blocker 5): in the `test` job, ubuntu-latest legs run `npx playwright-core install --with-deps chromium`
and set `VID2_REQUIRE_PLAYWRIGHT=1`; scripts/test.mjs fails the run (not skips) when a test marked `requires: playwright` is skipped while that
variable is set, so a green Ubuntu leg proves the web capture e2e executed; macOS/Windows legs may skip it with the logged reason.
MODIFY: package.json (optionalDependencies uiohook-napi, peer playwright-core), src/compile/layers/media.ts (capture sources, camera auto,
cursor overlay), src/timeline/resolve.ts (EventResolver injection), README (Capture section), structure/capture.md NEW, INDEX.

## Verification (C for wp4)

`npm test` incl. web e2e: steps fixture (goto local page, click button, type, mark) → session with ≥ 3 actions, frame indices monotonic,
footage dims = 2× viewport, a timeline using `{event:"click#1"}` + `camera:{auto:"events"}` renders and the camera zoom > 1 at the click frame
(checked by comparing a crop's edge density/SSIM vs. unzoomed? simpler: render with a coloured target and assert its pixel area grows).
Manual on this Mac: `vid2 capture native --display 1 --duration 3 --json` → footage exists, dims = physical display pixels, recorded
limitations documented in structure/capture.md (permissions, Wayland, gfxcapture ≥ 8.1).
