# Changelog

## 0.6.0 — 2026-10-03

Motion cadence, component validation and a reproducible production study.

- Repeated field glyph, bar stagger, ticker interval, kinetic word stagger and highlight sweep durations retain authored precision until each cumulative stage-frame conversion. A 45 ms typing interval at 30 fps now places the tenth glyph at frame 12 rather than frame 9. Explicit zero glyph intervals reveal simultaneously.
- Component validation rejects empty spans, authored event starts outside the layer, non-increasing field typing starts and zero ticker intervals. Positive subframe periods, simultaneous chips and animation tails clipped by an intentional cut remain valid. Invalid timelines previously accepted may now return the existing E_INPUT validation envelope.
- Stage-family text receives sampled 5% title-safe warnings alongside contrast checks, with parent transforms, output scaling and existing waivers preserved. Sampling does not certify every motion state or collision-free travel.
- `vid2 example new motion-study` ships an original offline 11-second film with typing, staggered bars and retained-word reflow. Its exact frame checkpoints, spacing and readable holds are documented; it needs ffmpeg and bundled fonts only.
- Packaged direction and CLI guidance distinguish entrance, reading hold and exit; explain cumulative timing; and use portable example navigation after skill copy installation. The study retains a documented frozen-detector warning for its mostly static opening scene.

## 0.5.0 — 2026-09-30

Help you can navigate, the example films on demand, and a repository of its own.

**Examples on demand.** The six example films now ship in the npm package as code and steps, each with an `example.json` manifest.
`vid2 example ls` lists them, `vid2 example show <name>` prints what one needs, which files to edit and its exact steps, and
`cd "$(vid2 example new <name>)"` copies it into `$VID2_HOME/examples/<name>`; re-running keeps your edits and media, and `--force`
refreshes the sources. The new
`vid2-examples` skill maps a request (paper cutout, puppet story, launch film, keynote-style intro, capture-led demo, generated clip,
changelog, social vertical) to the closest example or template and the fastest route to a render. `vid2-intro`, a quiet keynote-style
film about vid2 itself, joins the examples, and `vid2-launch` no longer needs a repository checkout for its app capture.

**Help you can navigate.** Commands are grouped in `vid2 --help`, which also lists global options, environment variables and
examples. Every command and subcommand answers `--help` with its arguments, options (value names and defaults), inherited and global
options, and examples; `vid2 help audio beats` prints the same text as `vid2 audio beats --help`. `-v`/`--version` prints the
version. Help never runs a command and never fails on a bad flag.

**Subcommands are real commands.** `audio`, `assets`, `capture` and `skill` have one spec per subcommand, each with its own options.
Options are now strict per subcommand, so `vid2 audio beats --preset x` is an input error instead of being ignored. A subcommand must
directly follow its parent (`vid2 audio beats x.wav`); `vid2 audio --json beats` explains that. Typos get a suggestion
(`vid2 skill instal` → `install`). Extra positional arguments are refused (`vid2 audio beats a.wav b.wav` used to ignore `b.wav`),
and the command word must come before `--`.

**JSON contract changes.** Per-command help JSON (`vid2 <cmd> --help --json`, `vid2 help <cmd> --json`) now carries the full help
text in `data.usage`; the one-line synopsis moved to `data.synopsis`. Help JSON adds `group`, `description`, `examples`,
`subcommands`, `defaultSubcommand`, `globalOptions` and `environment`, and `vid2 capabilities` lists subcommands. A failure envelope
reports the full command path (`"command": "audio beats"`). Success `command` values are unchanged.

**Repository and release.** Development moved out of a shared checkout into vid2-gen's own git repository; nothing changes for users.
Releases now publish from the `v*` tag through npm Trusted Publishing (`release.yml`, OIDC, with provenance) instead of a local token.

## 0.4.0 — 2026-09-29

Hardware encoding you can trust, examples that keep only code in git, and the first npm release.

**Hardware encoding.** `vid2 render --hw-accel disable|if-possible|required` (`--hw` is shorthand for `if-possible`) and `--hw-encoder videotoolbox|nvenc|qsv|amf|vaapi` choose the final encoder before any segment renders. An encoder counts only after a five-frame trial encode passes, so a compiled-in NVENC without a GPU no longer fails mid-render. H.264 and HEVC are supported in every family, ProRes through VideoToolbox, and VAAPI gets its device and `hwupload`. `if-possible` falls back to software with a warning. `required` exits 3 with the failed probes. Render JSON and `<out>.render.json` report `encoder: { name, hardware }`, and `vid2 doctor --hw` shows which encoders pass. VideoToolbox quality was raised from `q:v 65` to `q:v 70` (HEVC `q:v 74`) after measurement: on a grain-heavy 1080p film the old setting scored VMAF 96.6 at an 11× smaller file, while the new one scores 97.4 against 97.5 for software `x264 -preset slow -crf 18`. That film now renders in 34 s with `--hw-accel required` instead of 70 s.

**Examples.** Examples keep their code and how-to in git. Media, captures, generated timelines and renders live in `$VID2_HOME/examples/<name>`, and `node examples/workspace.mjs <name>` copies the sources there. `examples/README.md` indexes them. Two motion examples are new: `opus-astra-paper`, a paper-cutout short made only from stage nodes, and `claude-codex-dawn`, a puppet film with reusable helper modules. The vid2-launch captures and stills and the ima2 icon left the repository; each README lists the command that recreates them.

**Bun.** vid2 runs under Bun and renders frames identical to Node's; a CI job checks this on every change. It is not faster: a full render took 55–57 s on Bun against 54 s on Node, and the stage renderer ran at 51 fps against 64 fps. Node 22.18+ remains the supported runtime.

**Install.** `npm install -g vid2-gen`. CI now also runs on pushes to `dev`.

## 0.3.0 — 2026-09-28

Cuts that land on the beat, a film you can inspect without watching it, and a finishing layer for looks and HUDs.
Every change here came from frame-by-frame measurements of reference launch films against our own (devlog/_fin/260928_film_grammar).
The launch film from 0.2.0 stays attached to [v0.2.0](https://github.com/lidge-ai/vid2-gen/releases/tag/v0.2.0).

**Generated clips.** ima2 video requests validate options and ordered image references before a provider call. Reference cache keys track image bytes and order while requests without references retain their prior keys. A generated clip read beyond its duration holds the last frame and reports `W_GENERATED_CLIP_HOLD` in render output and the saved render manifest. A Grok example has an offline file-provider twin. Windows absolute `--ref` path parsing remains untested with ima2; live Grok verification is macOS only.

**Film looks and HUD.** Root `film`, `riso`, and `paper` looks now compile after the scene join with seeded textures and strength-scaled
parameters. A zero-strength look leaves the post graph unchanged. A timeline HUD renders above overlays and root effects in
absolute-time chunks, with its chunk count and look settings visible in the compile summary.

**Analysis and review.** `vid2 analyze` writes shot, color, motion, beat/onset and audio DSP evidence with keyframes and contact sheets. `vid2 review` combines that analysis with QA evidence, optional OpenAI-compatible frame critique and opt-in audio listening. Missing model configuration produces a local `SKIPPED` report; listener failures are recorded as `UNHEARD` without changing the review exit code.

**Behavior changes.** Scene boundaries are quantized once from the exact running time instead of rounding each scene, so beat- and bar-cut films stay on the grid (a 40 s film at 132 BPM previously drifted 4 frames); a non-cut transition can resolve one frame longer or shorter depending on position. Auto cameras now honor the authored `hold` (default `0.8s`; it was ignored and 0.5 s / 0.7 s were used) and simplify to at most 24 keys.

**Fixes.** Media `out` is honored for video and capture sources (the read stops at `out` and the last allowed frame holds). A segment that reads one file several times reads lossless FFV1 cuts instead of seeking the source repeatedly (ffmpeg could stall). Camera expressions over 100,000 characters fail with a pathful `E_INPUT` instead of an ffmpeg out-of-memory error.
A stall watchdog kills an ffmpeg that stops making progress for `VID2_FFMPEG_STALL_MS` (default 180 s) and retries the segment once; ffmpeg occasionally deadlocked on segments with many looped inputs and the render waited forever. QA keyframes, contrast samples and analyze keyframes seek to the frame instead of decoding from the start (four at a time), so QA on a 40 s 1080p film no longer takes several minutes.

**Time.** New `bar` unit (`"1bar"` = `meter` beats) everywhere a time literal is accepted.

## 0.2.0 — 2026-09-28

Launch films that look designed: a motion-graphics engine for words, icons and rebuilt UI, driven by the same timeline file.

**Stage engine.** A deterministic pure-JS 2D renderer (text, images, rounded rects with glow/shadow, stroke icons, paths, groups with
clips; keyframes and closed-form springs; blur levels; dirty-rect compositing) whose frames ffmpeg encodes to a cached FFV1 alpha clip,
composited like any layer. `stageRenders` in the render plan keep `vid2 render plan.json` working; 0.1 plans still load. No new runtime
dependency; images decode through ffmpeg.

**Kinetic typography.** `kinetic` layers build sentences from token states: rise/blur/fade/pop per word, type/drop/scramble per glyph,
accent colour that decays, reading highlight, 58 built-in Lucide icons (ISC) or image sources as words, magic-move reflow of shared
words, a pill that grows with the line, camera follow, and `expand` to grow an icon into the frame.

**UI components.** `field` (typing into a growing pill, caret, synthetic cursor with click ripple, masking), `bars` (staggered growth,
glow, count-up), `ticker` (prefix + rolling list with icons), `chips` (pills with connector lines and a travelling dot), plus a raw
`stage` layer.

**Transitions and sound.** `zoomfrom` grows the next scene out of a rect; `iris` opens a circle from a point; both work in preview.
`autoCues` now follows the animation (typing ticks, pops, clicks, a riser that ends when an expand settles, swooshes on reflow) with
per-layer limits, and authored cues win. The audio plan records every automatic cue.

**Quality.** `vid2 qa` checks contrast of stage text at its settled frame. `vid2 capabilities` lists layers, icons and custom
transitions. New `kinetic-launch` template and a kinetic-grammar reference in the direction skill.

**Made with it.** [examples/ima2-launch](examples/ima2-launch): a 50-second ima2-gen launch film from real ima2 generations and a real
capture of the ima2 web UI (QA pass, −14 LUFS; sync and typing-cadence checks in `check-sync.mjs`).

**Known limits.** Stage clips cover the full frame, so tiny stage layers still pay full-frame encode cost. Glyph shaping has no GSUB
(ligatures and complex scripts); Hangul works with a custom font. npm publication is still pending; install from the release tarball.

## 0.1.0 — 2026-09-28

The first release: a video CLI that coding agents drive through one declarative file.

**Render.** Timeline schema v1 (JSON Schema published) with frame-exact scene placement, 30+ xfade transitions, sub-pixel perspective camera moves,
Ken Burns / punch / drift presets, window cards with rounded masks, shadows and 3D tilt, screen/add overlays, grade, vignette, grain, flash,
RGB split and motion blur. Text through libass with bundled Geist, Geist Mono and Instrument Serif (SIL OFL), or a pure-JS raster backend when
ffmpeg has no libass (Homebrew ffmpeg 9). Segment cache, proxy and final profiles, ffprobe verification of every output.

**Capture.** `vid2 capture web` (Chromium via Playwright + CDP screencast, action log, typed text redacted by default), `capture native`
(macOS avfoundation tested; Windows ddagrab/gdigrab and Linux x11grab experimental; Wayland unsupported), `capture electron` and
`capture terminal` (experimental). Automatic camera from actions and a synthetic cursor with click ripples.

**Audio.** Synthesized music beds (launch, minimal, tech), eight SFX presets anchored to cuts, auto cues from transitions and captured clicks,
voice ducking, two-pass loudness to −14 LUFS with AAC/Opus mux. Optional ElevenLabs and local ACE-Step through `vid2 audio generate`.

**Assets.** Optional ima2-gen adapter for images and Grok clips with a content-keyed cache; renders never call a provider unless asked
(`--generate`). `--placeholders` renders cold templates.

**Agents.** `vid2 qa` evidence reports, `vid2 preview` exact frames, `vid2 capabilities`, six packaged Agent Skills (`vid2 skill install`),
four templates (`vid2 init`), JSON envelopes and typed exit codes everywhere.

**Known limits.** ffmpeg 6.1+ required (7.1+ recommended). Grok video generation was not exercised in the launch video because the lane was
signed out locally; the stills path was used. npm publication of 0.1.0 is pending; install from the GitHub release tarball meanwhile.
