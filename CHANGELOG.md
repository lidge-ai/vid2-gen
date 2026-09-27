# Changelog

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
