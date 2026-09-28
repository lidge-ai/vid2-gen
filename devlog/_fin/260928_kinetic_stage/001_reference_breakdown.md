# 001 — Reference breakdown: the Aside launch film

**Summary.** The Aside launch film (x.com/hyojun_at/status/2069497198879048131, 1920x1080, 29.97 fps, 87.6 s, AAC 48 kHz, −14.1 LUFS
integrated, LRA 8.7 LU, no silence gaps) is almost entirely *rebuilt vector UI and kinetic typography*, not screen recording. ffmpeg's
scene detector finds only six hard cuts (53.0 s, 66.6 s, 71.8 s, 79.3 s); everything else is continuous motion, magic-move reflow and
dissolves. vid2 0.1 can cut, caption, capture and grade, but it has no per-word or per-glyph motion, no layout reflow, no animated UI
components and no transitions that feel like "the app opens". This unit adds them. Frames used for this analysis were extracted to
`/tmp/vid2-ref-aside/` (sheet_1/2 = 1 fps contact sheets, fine_a..l = 10 fps strips); they are analysis scratch and are not committed.

## Timecoded inventory

| Time (s) | What happens | Technique |
|---|---|---|
| 0.0–0.8 | Empty search bar, I-beam cursor slides in with a short motion trail and clicks | UI field component, cursor with trail |
| 0.8–1.6 | "We killed" is typed into a glowing pill; the newest glyphs are cyan and fade to white over ~0.3 s | per-glyph typing, accent decay, glass pill |
| 1.6–3.1 | App icons pop in one after another after the words; the camera pans left so the newest token stays in view; the pill grows | inline icon tokens, pop entrance, camera follow, container resize |
| 3.5–5.5 | Icons lift above "They promised us to do the work"; a trash can swallows them | icon choreography, word build, accent on a key word |
| 6–7.5 | "Instead, they bury you in" — the word being said is tinted, earlier words neutral | reading highlight (karaoke by word) |
| 7.6–9.0 | Dozens of "Connect App +" buttons scatter with directional motion blur and duplicates | clone/scatter with motion blur (echo) |
| 9.0–9.6 | "buttons..." glyphs drop in one by one with a small vertical offset and blur | per-glyph stagger |
| 10–17 | Chat window mock: "I can't do that" messages stack, list tilts away and falls | UI mock + 3D-ish tilt exit |
| 18–19 | "Introducing" over a dock; the Aside dock icon stretches into a full-screen gradient (genie-like) | zoom-from-rect transition |
| 19–21 | "Aside" letters blur in over light rays with a slow push-in; flash to white | glyph blur-in, slow camera push, fade to white |
| 21–23 | Light scene: logo + "A browser that gets complex work done" appears line by line in grey, then a highlight sweeps word by word to black | line build + reading highlight sweep |
| 23–25 | "across 🌐 websites 🔑 accounts 🕘 history" — inline icons as words, staggered lines | inline icons, staggered layout |
| 26–41 | Rebuilt browser UI: typing a task, thinking lines, Chase card; camera drifts across a large canvas | field typing, camera pan over mock UI |
| 42–47 | "Spawning subagents in parallel" chip typed while the camera pans; connector lines draw with a travelling dot to child chips | chip component, line draw, camera follow |
| 48–52 | Steps list ("Starting a chat with the support", "Asking for a refund") scroll up | list step component |
| 53.0 | Circular iris wipe from white to dark | shape-mask transition |
| 53–57 | Benchmark: the winning bar grows from the left with a glow, other bars and labels type in, values count up | bar chart component, number count-up |
| 57–60 | "Anything you can do in a 🌐 browser" builds word by word; then everything except "🌐 browser" exits and it re-centres | magic-move reflow by token key |
| 60–66 | "Aside can do → sign in / messaging / payments / documents..." — a vertical ticker rolls under a fixed prefix, icon swaps per item, items fade with depth | ticker component, prefix anchoring |
| 66–70 | Icon scales to fill the frame, cut to light scene; "everything is private" with gaps opening for inserted words | magic-move with insertions |
| 70–74 | Laptop mock zooms out; "runs 🗄 locally, encrypted" — scramble text resolves into "encrypted" | scramble/decode text |
| 75–79 | "Aside won't let AI read_your_passwords" in a field, then masked to asterisks with an eye icon | field typing + mask |
| 79–87 | "Bring your own subscription" + provider icons row, logo lockup, URL end card | icon row, end card |

## Grammar distilled (what makes it look expensive)

1. **One idea per frame.** At most one sentence on screen; key words carry the meaning, the rest leave.
2. **Words and glyphs are actors.** Typical cadence 90–160 ms between words, 30–45 ms between typed glyphs; entrances combine
   8–16 px rise, 6–18 px blur and opacity over 250–400 ms with an ease-out (no bounce on text; icons get a small overshoot pop).
3. **Continuity over cuts.** Tokens persist across states and move to their new layout (FLIP) with a spring (≈ 350–500 ms settle);
   exits blur and fade in 200–300 ms. Hard cuts are rare and land on musical accents.
4. **Accent colour as a cursor of attention.** Newest glyph/word tinted (cyan on dark, blue on light) decaying to neutral in ~300 ms;
   reading highlight sweeps grey → full contrast word by word.
5. **Icons are nouns.** Inline icons sit on the text baseline at ~1.05× cap height with the same entrance as words.
6. **The camera never rests.** Slow push-ins (≈ 2–4 %/s), pans that follow the newest token, zooms into UI regions.
7. **Rebuilt UI beats screen capture** for clarity: clean components (pill field, chat bubbles, chips, bars, lists) at full vector
   sharpness, sized for 1080p legibility. Real capture is used only as a backdrop or device-screen texture.
8. **Scene temperature alternates** dark ↔ light every 10–25 s; transitions are iris, zoom-from-rect, flash-to-white or fade.
9. **Sound follows motion**: music bed with a steady pulse; typing ticks, whooshes on camera moves and pops on icon entrances sit
   under the music (−14 LUFS master).

## Numbers we will test against

- Word entrance 250–400 ms, glyph stagger 30–45 ms, accent decay ≈ 300 ms, magic-move settle 350–500 ms.
- Text size: headline 64–96 px at 1080p; UI text ≥ 22 px; lines ≤ 28 characters.
- Average hold after a sentence completes ≥ 0.6 s before it transforms.
