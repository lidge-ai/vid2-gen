# Motion, easing, and transitions

Default entrance 0.35–0.45 s; exit 0.2–0.3 s. Stagger related labels by 0.08–0.16 s as a starting point. Budget the whole group: `entrance duration + (item count - 1) * stagger`, then a readable hold, then exit or cut. A 0.5 s group entrance only works when its count and stagger fit that budget. Start with at least 1 s of readable hold for a short phrase; allow more for unfamiliar copy, dense values or narration. Count the hold after the last relevant entrance, accent decay and layout movement, not from the first word's arrival. An intentional cut may interrupt motion; do not count that interrupted interval as reading time.

Motion speed vocabulary: slow = 1.05–1.12× zoom over 3–5 s; medium = 1.1–1.2× over 1.5–3 s; punch = 1.25–1.6× over 0.25–0.5 s. Describe moves with these numbers and an anchor point. These are design options, not measured timings from the references below.

| Intent | Camera key ease | Example |
|---|---|---|
| Enter and settle | `out` | Push from zoom 1 to 1.12 in 0.4 s, then hold |
| Leave or accelerate to cut | `in` | Pull focus off the button during last 0.25 s |
| Continuous travel | `inout` | Pan x 0.45→0.55 over 2 s |
| Mechanical tracking | `linear` | Match a cursor or clip moving at steady speed |
| Single impact | `punch` | 1.25× at a reveal, then settle |

A hard `cut` resets attention or marks a new claim. A `fade`/`dissolve` says the thought continues; 0.2–0.4 s is enough for a product reel. A directional `slideleft`/`wiperight` can express navigation when it matches the actual UI travel. Use no more than 1–2 conspicuous transitions across a 5–7 beat passage; repeated shader transitions hide weak shot selection. A `fadeblack` may announce a chapter or ending. Probe both sides and midpoint of every non-cut transition, since overlapping scene starts change the total frame count.

Prefer motion tied to an event or audio hit. Let the hero move and keep the label still long enough to read. Use a camera move to reveal proof or follow an action; a fixed camera can make typing, reflow and comparison easier to follow. Ambient motion is an available style, but check whether it competes with the reading hold.

## Timing without cumulative drift

For repeated glyph, word, bar or ticker onsets, preserve the authored interval in seconds. The compiler first quantizes the start anchor to the output frame grid. With that anchor expressed in seconds as `start`, zero-based `index`, and unrounded `interval`, the local onset at normal stage rate is:

```text
frame(index) = round((start + index * interval) * fps)
```

Add the resolved layer's absolute start frame for timeline previews. Do not round `interval * fps` first and multiply that integer: it changes the rhythm as the group grows. At 30 fps, a 45 ms interval is 1.35 frames; ten glyphs starting at zero reach the tenth onset at frame 12, not frame 9. At 60 fps the same interval is 2.7 frames. Alternating frame gaps, multiple glyphs on one frame for subframe intervals, and explicit zero glyph/stagger periods can all be intentional; ticker intervals must remain positive. Use the authored cadence and FPS to judge the result, rather than a universal maximum gap. With motion-blur oversampling, final rounding uses the internal stage rate (`fps * rate`); encoded output remains on the output FPS grid. Absolute anchors and nonrepeated durations keep their existing frame quantization.

## Reserve space before animating

Measure the final phrase and its later states before adding entrances. Position a centered composition using each preset's own origin:

| Preset | Space to reserve |
|---|---|
| `field` | `x,y` center the pill. Reserve the full typed string plus both insets; without `grow`, the text inset is 30 authored px. |
| `bars` | `x,y` locate the top-left of the stack. Row centers are `y + index * (rowHeight + gap) + rowHeight / 2`. Reserve value-label width beyond the track, starting at `x + width + size * 0.8`. |
| `kinetic` | Use the chosen alignment, measured word widths, `maxWidth`, `lineHeight` and `gap`. Reserve both state layouts and the travel of retained actors while departing words exit. |
| `chips` / `ticker` | Reserve the longest label, icons and notes in the chosen flow direction, including changing or departing items. Preview the resulting bounds instead of borrowing another preset's origin. |

The offline `motion-study` example (`vid2 example show motion-study`) uses a centered field, bars with 18 px row gaps, and a retained word moving between two layouts. Its 11 seconds at 30 fps include deliberate reading holds and a fixed camera. Those dimensions are local choices; adapt them to the actual copy and frame size.

## Review the event and the hold

For every important onset, exit, cut or reflow at absolute frame `E`, inspect `E-1`, `E`, and `E+1`, clipped to `0..totalFrames-1`. Also inspect the end of the entrance and the beginning, middle and end of the reading hold. Use explicit frame tokens such as `257f,258f,259f`; the CLI does not evaluate arithmetic in `--at`. For non-cut transitions, add the midpoint of the overlap. Follow the [CLI motion review recipe](../../vid2-cli/SKILL.md).

A sparse contact sheet establishes composition and continuity. Consecutive encoded frames establish short-event timing; playback establishes perceived rhythm. Neither replaces the others. Timeline-aware QA includes stage text safety and estimated contrast at each eligible text node's first sampled opaque hold, after its color animation ends. It does not prove geometric settling, later reflow layouts, collision-free travel, every frame's contrast, audio quality or accessibility compliance.

## Primary production references

- [Remotion Hello World title source](https://github.com/remotion-dev/template-helloworld/blob/main/src/HelloWorld/Title.tsx) and [preview](https://remotion-helloworld.vercel.app/?/HelloWorld): word entrances use five-frame offsets inside reserved layout. Research inspected source and sampled rendered states.
- [Motion Canvas Smooth Parallax source](https://github.com/motion-canvas/examples/tree/8ffefed144368d33de4b0e451894c718eb95d574/examples/smooth-parallax) and [creator video](https://youtu.be/c_3TLN2gHow): named source cues separate holds from entrances and exits. This was a source inspection, not a full-playback observation.
- [Creativly product-film orchestration](https://github.com/naveen-annam/creativly.ai-brand-video-remotion/blob/main/src/BrandVideo.tsx): scene code and sampled product/UI/end-card states inform sequencing. Exact easing, complete playback and audio sync were not measured.

These references inform original choreography; they do not supply copied media, universal timing thresholds or proof that the local study has passed visual review.
