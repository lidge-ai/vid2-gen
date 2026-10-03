# Motion study: make room

An original, silent 11-second study at **960×540, 30 fps**. A field types “make room”,
three bars arrive in sequence, and “Room to think” reduces to the same retained
“Room”. Each scene leaves time to read. Only ffmpeg and vid2 are needed: fonts are
bundled, and there are no downloads, captures, external assets or audio tracks.

## Reproduce

Run these commands with the installed CLI. All outputs stay in the copied example
workspace. The preview samples are zero-based global output frames, not seconds.

```bash
cd "$(vid2 example new motion-study)"
vid2 validate timeline.json
vid2 preview timeline.json --at 14f,15f,26f,60f,89f,90f,99f,108f,123f,150f,179f,180f,208f,257f,258f,264f,277f,306f,329f --profile final --out out/preview
vid2 render timeline.json -o out/motion-study.mp4
vid2 qa out/motion-study.mp4 --timeline timeline.json --out out/qa
```

Open `out/preview`, the QA report in `out/qa`, and `out/motion-study.mp4`.
Playback is necessary to judge rhythm; sparse thumbnails cannot verify every
transition frame. For a close review, inspect consecutive encoded frames 14–27
(typing) and 257–278 (reflow). The film is intentionally silent, so the QA command
does not require audio. Text-safe QA samples the first opaque hold; it does not
certify every state, collision, settled position or frame of contrast.

The freeze detector may warn about the first 0–3 s scene: its small glyph changes
can fall below the detector's threshold. Check the typing frames and intended
reading hold before deciding whether to waive that warning; do not assume that
an exit code of zero means a warning-free report.

## Timing and spacing

| Scene | Global frames / time | Expected motion and reading hold |
|---|---|---|
| Make room | 0–89 / 0–3 s | Type at frame 15 with 45 ms between glyphs. Last glyph begins at 26; reserve 36–89 for reading after accent decay. |
| Spatial stagger | 90–179 / 3–6 s | Rows start at 99, 103, 108 and finish growing at 114, 118, 123. Read all three from 123–179. |
| Retain Room | 180–329 / 6–11 s | Entrance completes at 208; read through 257. Reflow starts at 258, departing words disappear at 264. Reserve 282–329 for the final word. |

The field is centered at (480,270), with a 600×76 box and a 30 px text inset.
The glyph onsets are **15,16,18,19,20,22,23,24,26**; the space consumes an interval.
An output-grid anchor plus cumulative unrounded intervals determines each onset:
`round((0.5 + index * 0.045) * 30)`. Rounding 45 ms first would change the cadence.

Bars use a top-left origin, (220,177), rather than the field's center origin.
Their 50 px rows have 18 px gaps and centers at y=202,270,338. Tracks end at x=680;
value labels start at x=697.6. **45, 65 and 85 are illustrative values**, not scores
or measurements. The 145 ms stagger is accumulated before frame rounding.

The kinetic text uses 48 px sans semibold with lineHeight 2.25. The initial line
centers are y=216 and y=324. The `room` key survives both states, so one actor moves
to y=270 while the lower line fades away. Its critical spring (196 stiffness,
28 damping, mass 1) reaches its calculated 0.2% tolerance around frame 277;
the final reading hold starts later, at 282. This is a calculated timing target,
not a substitute for inspecting rendered geometry. The camera remains fixed.

Edit `timeline.json` to change words, illustrative values, gutters or timing.
Keep the same `room` key and text in both states to retain that actor. Recheck
wrapping and readable holds after changing copy; these numbers belong to this
composition and are not universal video rules.

## Production references and provenance

This example uses original copy, geometry and timing. No third-party source
implementation or media is bundled. Public references informed the approach:

- [Remotion Hello World preview](https://remotion-helloworld.vercel.app/?/HelloWorld)
  and [title source](https://github.com/remotion-dev/template-helloworld/blob/main/src/HelloWorld/Title.tsx):
  research sampled rendered states and read the source-defined five-frame word
  offsets inside a reserved layout. Our intervals and layout are different.
- [GitHub Unwrapped source](https://github.com/remotion-dev/github-unwrapped) and
  [showcase](https://www.remotion.dev/showcase): sampled video states informed the
  use of whitespace around statistics. Showcase and repository versions differ;
  this is not exact film-to-code provenance.
- [Motion Canvas Smooth Parallax source](https://github.com/motion-canvas/examples/tree/8ffefed144368d33de4b0e451894c718eb95d574/examples/smooth-parallax)
  and [creator video](https://youtu.be/c_3TLN2gHow): source inspection showed named
  cues separating holds from motion. The research did not verify video playback.

Research observations were collected on 2026-10-03. They were sampled states or
source reads, not full-video timing measurements. The 45/145/135 ms intervals,
gutters, spring and hold durations above are original design choices. See
[Motion's stagger documentation](https://motion.dev/docs/stagger) for per-item
delay semantics and [Remotion's frame clock](https://www.remotion.dev/docs/use-current-frame)
for a frame-indexed authoring comparison; neither supplies this film's numbers.
