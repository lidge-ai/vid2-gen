# opus-astra-paper — a paper-cutout short made from code

"Opus & Astra" is a 26-second, 1920×1080 short about claude-opus-5-5 and gpt-6-astra getting along. Every shape is a vid2 `stage` node
animated in JavaScript: rounded rectangles with paper shadows, spring pops (`POP`/`SETTLE`), squash and stretch, blinking eyes, floating
hearts and a finale flash. The only raster input is a procedural paper sheet painted by `make-paper.mjs`. The cue is a 100 BPM music box
written with [music2-gen](https://github.com/lidge-ai/music2-gen), so one bar is 2.4 s and every scene starts on a bar line.

| File | Role |
|---|---|
| `build-timeline.mjs` | Writes `timeline.json`: a small key collector (`stage()`), the two characters, four scenes and root grain/vignette |
| `make-paper.mjs` | Paints the 1920×1080 paper sheet (value noise, fibres, blotches, grain) and saves it through ffmpeg |
| `music/gen-song.mjs` | Generates `music/opus-astra.song.json`, the music2 score |

## Build and render

```bash
cd "$(node examples/workspace.mjs opus-astra-paper)"
node make-paper.mjs media/paper.png
node music/gen-song.mjs music/opus-astra.song.json
music2 render music/opus-astra.song.json -o media/music.wav
node build-timeline.mjs                                   # writes timeline.json
vid2 validate timeline.json
vid2 preview timeline.json --at 1s,5s,12s,22s --out out/preview
vid2 render timeline.json --profile proxy -o out/proxy.mp4
vid2 render timeline.json -o out/opus-astra-paper.mp4     # add --hw for a hardware final encode
vid2 qa out/opus-astra-paper.mp4 --timeline timeline.json --expect-audio --out out/qa
```

Without music2-gen, drop the `music` source and `audio` block from `build-timeline.mjs`; `autoCues` then has no bed to sit under.

## Reusing the techniques

The key collector keeps one keyframe map per node and property, so helpers such as `face()` or `floatHeart()` can add motion to the
same node without knowing about each other; `layer()` turns the maps into sorted tracks at the end. A seeded `rnd()` keeps confetti
and paper fibres identical between renders, which keeps the stage cache warm. See [structure/stage.md](../../structure/stage.md) for the
node kinds, easing names and spring parameters the stage accepts.
