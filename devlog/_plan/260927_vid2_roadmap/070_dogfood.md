# 070 — wp8 Dogfood (launch video rendered by vid2) + docs polish

Consumes everything. Goal: prove vid2 can produce a video at least as good as the hand-built 30 s prototype, from a declarative timeline,
with no campaign paths in engine code (ARCH-10 phase 7).

## Plan

1. Brief (`examples/vid2-launch/BRIEF.md`): message "The video CLI for coding agents", audience agent users on X/GitHub, 16:9 1920x1080, 30–35 s,
   120 BPM synth music (launch preset), references: the prior prototype + two X examples from x-survey (named by URL).
2. Storyboard stills: `vid2 preview` stills of a draft timeline (contact sheet reviewed before motion work).
3. Footage: (a) terminal capture of vid2 itself via VHS tape (`examples/vid2-launch/terminal.tape`: `vid2 init launch-30s demo`, `vid2 render …`,
   `vid2 qa …`) when `vhs` is on PATH; fallback (audit blocker 6, activated when `vid2 doctor --json` reports `tools.vhs: null`): web capture of
   `examples/vid2-launch/code-page/index.html` (static page, no build step: a dark editor-style panel that types the timeline JSON with syntax
   colouring driven by a small inline script, plus a fake terminal pane that prints `vid2 render` progress lines) via
   `vid2 capture web --serve examples/vid2-launch/code-page --steps examples/vid2-launch/code-page.steps.json --out .vid2/code.vid2cap`;
   both paths produce the capture source id `code` used by the timeline, so the timeline does not change;
   (b) web capture of the ima2-gen UI on an isolated server (reusing the prototype's isolation env list from 002) generating 4–6 images;
   (c) assets via `vid2 assets resolve` with the ima2 adapter: 2 backdrops, 1 light leak, 1 Grok clip (image-to-video of a generated still).
   Grok fallback (audit blocker 6, activated when `vid2 assets providers --json` reports ima2 video `available:false`): render
   `examples/vid2-launch/timeline.stills.json`, identical to timeline.json except the `grok` source is replaced by the generated still `hero` with
   `motion: "punch"` + `camera` keys (committed as a second file; a test asserts the two files differ only in that source and layer).
4. Timeline `examples/vid2-launch/timeline.json`: intro slam → "Write a timeline" (code/terminal footage, camera auto on events) → "Capture the real
   app" (ima2 capture with synthetic cursor + ripples) → "Generate assets" (Grok clip + stills, beat cuts) → grid → features → outro with
   `npm i -g vid2-gen`. Typography via ASS presets; transitions chosen per skill guidance (1–2 shader-style transitions max, hard cuts on beats).
5. Loop: preview → proxy render → qa → fix → final render → qa; keep `qa.json` and contact sheet.
6. Publish assets for README: `assets/readme/vid2-launch.mp4` is NOT committed (size); instead a 10 s 720p GIF/webp preview (< 5 MB) and poster PNG
   are committed under `assets/readme/`; the full MP4 is uploaded to the GitHub release (080) and linked.
7. Docs polish: README hero (poster + link), quick start, command table, timeline example, agent skills section, capture/audio/assets sections,
   FAQ (why ffmpeg-first; how it compares to Remotion/HyperFrames: complementary, no React/HTML renderer required; license), CONTRIBUTING updates.

## File map

NEW examples/vid2-launch/{BRIEF.md,timeline.json,timeline.stills.json,steps.json,terminal.tape,code-page.steps.json,README.md},
examples/vid2-launch/code-page/index.html, tests/e2e/examples.test.ts (validates both timelines, checks the one-source difference, runs the
code-page capture fallback headless with --serve when Playwright is present, and renders timeline.stills.json with --placeholders --profile proxy),
assets/readme/{poster.png,preview.webp}; MODIFY README.md,
structure/overview.md (link example). Engine changes discovered here are fixed in the owning module with tests (each recorded in this doc).

## Verification (C for wp8)

`vid2 render examples/vid2-launch/timeline.json -o /tmp/vid2-launch.mp4 --json` ok; `vid2 qa /tmp/vid2-launch.mp4 --timeline … --json` exit 0
(waivers only for intentional fades); ffprobe 1920x1080 h264 yuv420p + aac 48 kHz; contact sheet reviewed by main (and one reviewer subagent
reading the contact sheet + keyframes for pacing/composition feedback); `git grep -n "/Users/"` in src/ and templates/ returns nothing.

