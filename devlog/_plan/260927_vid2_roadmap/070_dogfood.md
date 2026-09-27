# 070 — wp8 Dogfood (launch video rendered by vid2) + docs polish

Consumes everything. Goal: prove vid2 can produce a video at least as good as the hand-built 30 s prototype, from a declarative timeline,
with no campaign paths in engine code (ARCH-10 phase 7).

## wp8 architect consultation

Architect Gibbs W8-01..W8-06 (2026-09-28), checked locally: `vid2 doctor` reports vhs/agg absent and Chromium present; ima2 3.23.1 is healthy,
OAuth image lane ready, Grok video disconnected; ima2 UI selectors `textarea.composer__textarea`, `getByRole("button",{name:"Open gallery"})`,
`.gallery`, `.gallery__scroll`, `.history-thumb`; `#settings` exposes account controls. Dispositions:

- W8-01 accept: code-page web capture (no VHS). The page shows the real example timeline JSON and a terminal pane replaying the **captured** output
  of a real `vid2 render --json` run (stored as `examples/vid2-launch/code-page/render-log.json`); no invented progress. Template name is `launch-teaser`.
- W8-02 accept: the storyboard below (8 scenes, 900 frames at 30 fps, 120 BPM, starts on 2 s bars, two 0.25 s transitions, hard cuts elsewhere,
  click at 8 s, riser→impact at 14 s, whooshes at 10 s and 22 s, no voice).
- W8-03 accept with isolation: the ima2 UI capture runs against an **isolated** ima2 server (own `IMA2_*` data dirs and port, full env list in 002) whose
  gallery contains only this project's approved images, so no unrelated history appears; steps click Open gallery and a thumbnail only (never
  Generate or Settings). If the isolated server cannot start, the scene uses the code page's hero view instead (recorded as a deviation).
- W8-04 accept: assets = the existing hero (`hero.png`, sha256 f93ac782…) + two supporting ima2 stills (prompts above in the consultation) generated
  through `vid2 assets gen`; no Grok call; no extra filmstrip/neon/light-leak imagery.
- W8-05 accept: two passes — proxy render → qa → its contact sheet and seam stills become scene 7's media → final render → qa. README gets a poster PNG
  and a 10 s 1280x720 animated WebP (< 5 MB, measured); the full MP4 goes to the GitHub release.
- W8-06 accept: review gates as listed; the release render is `timeline.stills.json` while Grok is unavailable.

| Start | Dur | Scene | Type | Camera / sound |
|---:|---:|---|---|---|
| 0 | 2 s | graphite frame | "The edit is a file." (84 px) | still; click on first frame, reading hold |
| 2 | 4 s | code-page capture (timeline JSON) | "Write the timeline." | pan left→right 1.00→1.10, type in at 0.35 s |
| 6 | 4.25 s | `app.vid2cap` (feature-demo sample app, real steps) | "Capture the real product." | auto camera to the Publish click (~8 s), cursor + ripple, 0.25 s fade out |
| 10 | 4 s | `media/still-a.png`, `media/still-b.png`, `media/hero.png` as three window cards | "Choose the shot." | restrained leftward drift; whoosh at 10 s |
| 14 | 4 s | hero.png | "Turn assets into motion." | push 1.00→1.08; riser ends + impact at 14 s |
| 18 | 4.25 s | code-page terminal pane (real render log) | "Compile every frame." | 0.25 s slideleft out |
| 22 | 4 s | QA contact sheet + two seam stills (from pass 1) | "Inspect every cut." | one deliberate pan; whoosh at 22 s |
| 26 | 4 s | product name + `npm i -g vid2-gen` | "Ship the video." | command held ≥ 2 s; music fades out |

## Plan

1. Brief (`examples/vid2-launch/BRIEF.md`): message "The video CLI for coding agents", audience agent users on X/GitHub, 16:9 1920x1080, 30–35 s,
   120 BPM synth music (launch preset), references: the prior prototype + two X examples from x-survey (named by URL).
2. Storyboard stills: `vid2 preview` stills of a draft timeline (contact sheet reviewed before motion work).
3. Footage (W8-01/03): (a) code-page web capture — `examples/vid2-launch/code-page/index.html` (static, no build) types the **real** example
   timeline JSON with syntax colouring and a terminal pane that replays `code-page/render-log.json`, the captured JSON output of a real,
   independent `vid2 init launch-teaser demo && vid2 render demo/timeline.json --profile proxy --placeholders --json` run (the pane shows exactly
   that command; no dependency on this example's own render, no invented lines); captured with `vid2 capture web --serve examples/vid2-launch/code-page --steps
   examples/vid2-launch/code-page.steps.json --out examples/vid2-launch/code.vid2cap`; (b) the feature-demo sample app via `app.steps.json` (producers
   table below; no ima2 UI capture); (c) assets: the approved `hero.png` plus two supporting stills from `vid2 assets gen ima2 image` (W8-04 prompts); no
   Grok call.
4. Timeline `examples/vid2-launch/timeline.stills.json` is the storyboard and **release source** (table above). A Grok variant `timeline.json` is
   future work, created only when the Grok lane is available.
5. Two passes (W8-05): pass 1 renders proxy with `--placeholders` standing in for the scene-7 sources `qa-contact` and `qa-seams`; `vid2 qa` of
   pass 1 produces `contact.png` and seam keyframes, which are copied to `examples/vid2-launch/media/{qa-contact,qa-seam-a,qa-seam-b}.png`; pass 2 renders
   final with no placeholders → qa → review.
6. Publish assets for README: `assets/readme/vid2-launch.mp4` is NOT committed (size); instead a 10 s 720p GIF/webp preview (< 5 MB) and poster PNG
   are committed under `assets/readme/`; the full MP4 is uploaded to the GitHub release (080) and linked.
7. Docs polish: README hero (poster + link), quick start, command table, timeline example, agent skills section, capture/audio/assets sections,
   FAQ (why ffmpeg-first; how it compares to Remotion/HyperFrames: complementary, no React/HTML renderer required; license), CONTRIBUTING updates.

### Audit wp8 round 1 folds (normative; supersede W8-03's isolated server and step 3b)

- **No ima2 UI capture, no isolated server** (blocker 1): ima2's Create page and gallery show the user's unrelated generation history, which must
  not enter a public video, and an isolated server would lack the OAuth session needed to generate. ima2 is used only to **generate** stills, pinned
  with `IMA2_SERVER=http://127.0.0.1:3333`; vid2 copies results into the example (ima2 itself keeps its normal generated files, as for any generation).
  Scene 3 ("Capture the real product") records the feature-demo sample app instead (a real web app driven by real steps).
- **Producers** (blocker 2), all outputs under `examples/vid2-launch/`:

| Source | Producer |
|---|---|
| `media/hero.png` | `vid2 assets gen ima2 image "cinematic abstract hero background: a dark studio with a glowing film strip curving through space, soft volumetric light, subtle waveform lines, deep indigo and electric green accents, no text, no logos" --size 1536x1024 -o media/hero.png` (already generated, sha256 f93ac782…) |
| `media/still-a.png` | `vid2 assets gen ima2 image "Matte graphite cut-paper planes with one precise cobalt incision moving left to right, editorial lighting, generous dark negative space, no text, no UI, no filmstrip" --size 1536x1024 -o media/still-a.png` |
| `media/still-b.png` | same with "Warm off-white architectural paper planes arranged as a measured sequence, soft directional shadows, generous negative space, no text, no UI, no filmstrip" |
| `code.vid2cap` | `vid2 capture web --serve code-page --steps code-page.steps.json --size 1920x1080 --scale 1 --fps 30 --out code` |
| `app.vid2cap` | `vid2 capture web --serve ../../templates/feature-demo/site --steps app.steps.json --size 1920x1080 --scale 1 --fps 30 --out app` |
| `code-page/render-log.json` | redacted projection (below) of an independent `vid2 init launch-teaser demo && vid2 render demo/timeline.json --profile proxy --placeholders --json` |
| `media/qa-contact.png`, `media/qa-seam-a.png`, `media/qa-seam-b.png` | pass 1 QA (below) |

- **Two passes** (blocker 3): scene ids `file, write, capture, choose, assets, compile, inspect, ship`. Pass 1:
  `vid2 render timeline.stills.json --profile proxy --placeholders -o .work/pass1.mp4` (the three qa-* files are missing → placeholders), then
  `vid2 qa .work/pass1.mp4 --timeline timeline.stills.json --out .work/pass1.qa`; copy `.work/pass1.qa/contact.png → media/qa-contact.png`,
  `.work/pass1.qa/keyframes/compile-seam-before.png → media/qa-seam-a.png`, `.work/pass1.qa/keyframes/compile-seam-after.png → media/qa-seam-b.png`
  (`.work/` is gitignored). Pass 2: `vid2 render timeline.stills.json -o .work/vid2-launch.mp4` with no placeholders. The example test renders the
  committed timeline **without** `--placeholders` (proxy) and asserts no `W_PLACEHOLDER` warning.
- **Privacy and budgets** (blocker 4): `render-log.json` keeps only `{ok, command, data: {frames, profile, width, height, seconds, segments: [{id,
  cached}]}, warnings}` (no paths); the privacy scan already covers every tracked file (examples, README assets); captured frames are reviewed on
  contact sheets before commit. README assets: `assets/readme/poster.png` (1280x720) and `assets/readme/preview.webp` (10 s, 1280x720, animated,
  < 5 MB); the example test asserts both exist, the WebP's size < 5 MB and its dimensions via ffprobe.

## File map

NEW examples/vid2-launch/{BRIEF.md,timeline.stills.json,code-page.steps.json,app.steps.json,README.md,.gitignore}, examples/vid2-launch/code-page/{index.html,render-log.json},
examples/vid2-launch/{code,app}.vid2cap/ (recorded sessions, footage < 1 MB each), examples/vid2-launch/media/*.png,
tests/e2e/examples.test.ts (validates the timeline; re-runs the code-page capture and the app.steps.json capture of the sample app headless with --serve when Playwright is present, asserting
the app capture's labelled Publish click action exists and its footage visibly changes between the frame before and 6 frames after it; runs the two-pass
handoff in a temp copy — pass 1 proxy with the qa-* files removed and --placeholders, qa --timeline, copy the three named files, pass 2 proxy **without**
--placeholders asserting no W_PLACEHOLDER; and asserts the README assets: poster.png is 1280x720; preview.webp is < 5 MB, 1280x720, has > 30 frames and a total duration of 10 s ± 0.5 s by
ffprobe packet timestamps),
assets/readme/{poster.png,preview.webp}; MODIFY README.md,
structure/overview.md (link example). Engine changes discovered here are fixed in the owning module with tests (each recorded in this doc).

## Verification (C for wp8)

`vid2 render examples/vid2-launch/timeline.stills.json -o /tmp/vid2-launch.mp4 --json` ok (W8-06; timeline.json once Grok is available);
`vid2 qa /tmp/vid2-launch.mp4 --timeline … --json` exit 0
(waivers only for intentional fades); ffprobe 1920x1080 h264 yuv420p + aac 48 kHz; contact sheet reviewed by main (and one reviewer subagent
reading the contact sheet + keyframes for pacing/composition feedback); before commit `node scripts/privacy-scan.mjs --paths <every new examples/ and assets/readme/ text file>` (render-log.json, steps, timeline,
BRIEF, README, session.json, actions.jsonl) passes and the captured frames are reviewed on contact sheets; after commit the default tracked-file scan passes.


## Engine changes found while dogfooding

- Perspective window cards painted the whole frame black: a command-line `-f lavfi -i color=c=black@0` input negotiates a format without alpha.
  Fixed in src/compile/layers/{window,media}.ts by ending the lavfi string with `format=rgba`; regression test "a perspective window keeps the
  canvas visible outside its frame" (fails before, passes after).
