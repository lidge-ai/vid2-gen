---
name: vid2-examples
description: Use when a request looks like an existing vid2 example film or template and you want a render fast. Triggers include "make a video like", "start from an example", paper cutout or craft short, puppet or mascot story, product or app launch film, keynote-style intro, demo from real captures, generated AI clip, changelog, social vertical, or asking which examples exist.
---

# Start from an example

Six finished films ship with vid2 as code plus exact steps; media and renders are made in a workspace. Starting from the closest one is
faster and safer than a blank timeline, because its timing, sound and QA already work. Five `vid2 init` templates cover shorter formats.

## Pick the closest starting point

| Request looks like | Start from | Length | Needs beyond ffmpeg |
|---|---|---|---|
| Paper cutout, craft or cute character short; mascots without images | example `opus-astra-paper` | 26 s | music2-gen (optional) |
| Longer character story, logos or mascots walking as puppets, day-to-night mood | example `claude-codex-dawn` | 74 s | rsvg-convert, your logo files and fonts, music2-gen (optional) |
| Beat-driven product launch with kinetic type, UI pieces, generated images and a real web capture | example `ima2-launch` | 50 s | ima2-gen, Playwright, music2-gen (optional) |
| Calm, keynote-style product intro; a developer tool with a real command | example `vid2-intro` | 36 s | npx for music2-gen |
| Launch video built from real captures of a web app and a code page | example `vid2-launch` | 30 s | Playwright; ima2-gen optional |
| One AI-generated video clip inside a timeline | example `generated-video` | 7 s | ima2-gen Grok lane (offline twin needs nothing) |
| Kinetic launch built only from motion layers | template `kinetic-launch` | 30 s | none (two generated images render as placeholders until resolved) |
| Launch teaser with a hero image | template `launch-teaser` | 30 s | none (placeholder until resolved) |
| Walkthrough of one feature from a capture | template `feature-demo` | short | none (capture bundled) |
| Release notes, three items | template `changelog` | 20 s | none |
| 9:16 social post | template `social-vertical` | 15 s | none |

`vid2 example ls --json` returns every example's `goodFor`, `needs` and whether a workspace already exists; use it when the table
above does not settle the choice. Templates come from `vid2 init <template> <dir>` and render immediately with `--placeholders`.

## Fast route for an example

1. `vid2 example show <name>` (add `--json` to read `steps`, `needs`, `edit` and `output`). Check the needs before running anything;
   missing optional tools have a fallback below.
2. `cd "$(vid2 example new <name>)"` copies the sources into `$VID2_HOME/examples/<name>` and prints that path. Re-running only adds
   missing files, so your edits survive; `--force` refreshes every source file from the package (and overwrites your edits).
   `media/`, `out/`, `.work/` and `*.vid2cap/` are never touched. `--dir <path>` copies into an empty or new folder instead.
3. Run the manifest `steps` in order up to the proxy render, then open the proxy and the QA report. This proves the toolchain before you
   change anything.
4. Change only the files the manifest lists under `edit` for the new content (characters, copy, scenes, captures, the cue). Keep the
   scene lengths on the cue's bar grid unless you also change the cue.
5. Re-run from the step that builds `timeline.json`: validate, preview the touched scenes, proxy, QA, then the final render and QA.
   Follow the CLI loop in the vid2-cli skill for reading QA evidence.

## Fallbacks

- No music2-gen: drop the music source and the `audio` block the build script writes, or synthesize a bed with `vid2 audio synth`
  at the example's BPM and point the timeline at it.
- No ima2-gen: render with `--placeholders` for structure, or use the `generated-video` offline twin (`timeline.offline.json`).
- claude-codex-dawn needs your own logo artwork and fonts (`CLAUDE_SVG`, `CODEX_PNG`, `FONT_DIR`); nothing is bundled. Swap in any
  SVG or PNG marks with the same variables.
- No Playwright: the capture steps fail with exit 3; install Chromium for Playwright or replace the capture layer with a still.

## Reuse a technique without the whole film

| Technique | Where it lives (`vid2 example path <name> --source`) |
|---|---|
| Key collector, seeded `rnd()`, spring pops, squash and stretch, paper texture | opus-astra-paper: `build-timeline.mjs`, `make-paper.mjs` |
| Puppet builders and verbs (`to`, `hops`, `wave`, `blink`, `look`), sky/sun/hills world, bubbles | claude-codex-dawn: `puppets.mjs`, `lib.mjs` |
| Bar-synced cuts, UI layers (`field`, `bars`, `ticker`, `chips`), `zoomfrom`/`iris` | ima2-launch: `timeline.json` |
| Typed command, verbs lit one at a time, rolling number, keynote grammar | vid2-intro: `build-timeline.mjs` |
| Two-pass render that shows its own QA evidence | vid2-launch: `make-qa-media.mjs`, `timeline.stills.json` |
| Generated clip hold and the offline file provider | generated-video: `timeline.json`, `timeline.offline.json` |

Copy the helper into your own build script rather than importing across examples, so each workspace stays self-contained.
