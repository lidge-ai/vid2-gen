# Time and clock rules

| Authored value | Meaning at 30 fps | Use |
|---|---:|---|
| `1.5` or `"1.5s"` | 45 frames | Positions or durations |
| `"1500ms"` | 45 frames | Millisecond notes |
| `"45f"` | 45 frames | Frame-exact alignment |
| `"2b"` | 30 frames at 120 BPM | Beat-relative timing; requires `beat` |
| `"1bar"` | 60 frames at 120 BPM, 4/4 | Bar-relative timing (`meter` beats per bar); requires `beat` |
| `{"bar":3,"beat":1}` | 8 beats after bar 1 at 4/4 | Markers/positions on declared grid |
| `{"marker":"drop","offset":"-0.1s"}` | marker minus 3 frames | Time positions |
| `{"event":"click#2","offset":"0.2s"}` | second click plus 6 frames | Captured event placement |

FPS is rational: `"30000/1001"` stays rational through resolution. Scene boundaries are quantized once from the exact running time (`startFrame = round(exactStart × fps)`), so a film cut in beats or bars stays on the grid: 22 quarter-bar and bar scenes at 132 BPM never drift more than half a frame. A non-cut transition can therefore resolve to one frame more or less depending on where it falls. The resolved timeline reports each scene's `startFrame`, `frames`, global span and `totalFrames`. Non-cut transition duration is overlap: scenes of 90 and 90 frames joined with a 9-frame fade occupy 171 frames. A cut overlaps by zero.

A layer `start`/`end` is scene-relative. A scene `effect.at` is scene-relative; global `effects` and `overlays` are absolute. Audio cue and voice `at` are absolute. A capture layer's `in`/`out` EventRefs are on the footage clock. Its first placement sets the mapping; other EventRefs become timeline positions. Label actions so moving a scene does not break cue semantics. If an EventRef is ambiguous across captures, add `source`.

A `"2bar"` *position* means two bars after the grid offset, which is the start of bar 3; `{"bar":2,"beat":1}` is the start of bar 2.

Cut on the grid by choosing shot lengths from a ladder of ½, 1, 2, 3, 4 and 8 beats (`"0.5b"`, `"1b"`, `"2b"`, `"3b"`, `"1bar"`, `"2bar"`); strobe runs are 4–12 shots of `"0.5b"`.

A detected beat map may have a confidence score, but the author must choose a stable grid. Check the downbeat against the waveform before converting shot lengths into beats. Never assume an arbitrary track starts on beat zero.
