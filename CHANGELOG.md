# Changelog

## Unreleased

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
