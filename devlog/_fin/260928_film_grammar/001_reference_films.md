# 001 — Reference films: @donaldjewkes and @anabology (Opus 5.5)

Research date 2026-09-28. Sources were collected read-only with three parallel Aside exec runs (account u0) and analyzed locally with ffmpeg. Raw artifacts (mp4s, 0.5 s frame dumps, notes) stay outside the repository in `~/.aside/u/0/artifacts/vid2-research-260928/`; nothing from those videos is committed.

## The two films

| | donald — "Claude Pop" remake | anabology — "Gave Opus 5.5 donald's prompt, Midjourney, and a moodboard" |
|---|---|---|
| Post | https://x.com/donaldjewkes/status/2102801274173587569 (2026-09-23, 3.37M views) | https://x.com/anabology/status/2103534482930491441 (2026-09-25, 15.3M views, reposted by @elonmusk) |
| Prompt | Dictated ~10 min, full text https://x.com/donaldjewkes/status/2102801469976248500 | donald's prompt + Midjourney in the browser + a moodboard (https://x.com/anabology/status/2103575746119614715) |
| Tools | Opus 5.5 for 12 h; fal (image gen + Seedance 2.5 video), ElevenLabs, reference libraries, the PDoomVideo repo (https://github.com/JohnHeibel/PDoomVideo); cost 80 % of a Max plan + $75 fal (https://x.com/donaldjewkes/status/2102918438977151317) | Opus 5.5, Midjourney via browser, an image-to-video model, code-driven overlays |
| Format | 1920×1080, 30 fps, 141.6 s | 1920×1080, 24 fps, 306.5 s |

## Measured edit statistics (ffmpeg scene score > 0.3, RMS-flux onsets)

| Metric | donald | anabology | our opencodex 40 s cut | our ima2 launch |
|---|---|---|---|---|
| Cuts | 98 | 123 | 14 detected (22 authored) | 7 detected |
| Average shot length | 1.43 s | 2.47 s | 2.68 s | 6.21 s |
| Median shot | 1.20 s | 1.83 s | 1.27 s | 5.50 s |
| Cuts within 50 ms of an audio onset | **58 %** | **62 %** | **7 %** | 29 % |
| Mean luma / saturation | 152 / 19.9 | 107 / 6.9 | 67 / 10.0 | 96 / 4.8 |

## What the edit is made of

**Shot lengths are whole beats.** anabology's shots at ~131 BPM: 0.46 s (1 beat), 0.92 (2), 1.38 (3), 1.83 (1 bar), 2.75 (6 beats), 3.67 (2 bars), 0.21 (½ beat) strobe runs. donald's: 0.2, 0.42, 0.83, 1.67 s — the same ladder. Cut points are chosen on the grid; the variety comes from *which* multiple, not from free durations.

**Strobe bursts.** donald has runs of 7–12 shots at 0.07–0.23 s (lines 25–31 and 74–86 of the shot list); anabology has ½-beat inserts (buckles, tags, pedals) between 1-bar shots.

**A constrained look.** donald: paper cream, navy, orange, pink, mustard only; riso/halftone print texture, sunburst backgrounds, sticker labels. anabology: 35 mm grade (teal/amber, halation, grain), one orange accent that never changes, and a palette arc per section (night red → cold blue → olive → gold → foggy blue-grey → bleached white).

**Continuity devices.** A recurring protagonist in both (donald's sunflower girl + backup dancers from a character sheet; anabology's bob-haired runway model in numbered "Looks"). A persistent HUD: donald's "P(DOOM) 30 % → 99.9 %" counter top-left and a date stamp top-right on nearly every shot; anabology's thin mono HUD frames, a bottom ticker strip, split-flap counters, barcodes, receipt cards, stamps.

**Typography has roles.** anabology's notes list five: huge condensed grotesk caps for the hit word ("AGENTS.", "GAS", "SO BACK!"), left-aligned sentence captions with one or two orange words, letter-spaced monospace for HUD/subtitles, split-flap digits for counters, small italic serif accents ("Look 00."). donald alternates subtitle-size lyrics with full-frame poster type, including Chinese/Japanese/Korean.

**Repetition with variation.** The same composition returns with a color swap (donald's "SHROOMS" yellow → navy; "OPTIMIZING" three times on different grounds).

**Two-layer construction.** donald's prompt asks Opus to generate character sheets and Seedance clips as a *base*, then redraw everything as JavaScript animation over it (rotoscoping); anabology keeps the photoreal base and draws code overlays on nearly every shot. Transitions are mostly hard cuts on the beat plus paper-slide, torn-paper, halftone dissolve, slice glitch, iris, whip blur, sunburst wipe and dither dissolve.

**A verification loop is part of the prompt.** "You're going to want to watch the entire video multiple times, take screenshots at individual parts, and think about if something is really up to the bar"; "build out the right verification loops so that you can run seedance 2.5 as much as you need, and confirm that the audio is properly synced up."

## What this means for vid2

The films are not better because of a secret model; they are better because (1) every cut sits on the music, (2) the look is constrained and consistent, (3) persistent devices carry continuity between fast cuts, (4) typography has a small set of roles with deliberate scale contrast, and (5) the agent reviewed its own frames repeatedly. vid2 can express most of the construction already; it lacks timing exactness, a look system, HUD devices, and a review loop the agent can read. See 005 for the ranked gap list.

## Wider survey (X, last 3 months)

A third Aside run surveyed 155 agent-made video tweets and studied six frame by frame (notes kept outside the repository). The top-engagement agent video was [@IterIntellectus "video on western civilization"](https://x.com/IterIntellectus/status/2103212539895017864) (13.6M views, pure code-rendered); [@trymirage "Introducing Tesseract"](https://x.com/trymirage/status/2102429594804429138) was a 32 s product launch with ASL 0.71 s (44 cuts, median shot 0.17 s); [@shiri_shh /brag](https://x.com/shiri_shh/status/2103521939134550246) and [@Miguel07Code Shotbase](https://x.com/Miguel07Code/status/2102441708395041170) were made with HyperFrames. The product-launch pieces cut much faster than our films (0.71 s vs 2.68 s ASL), and the long-form music videos keep ~60 % of cuts on onsets.
