# vid2-intro — vid2-gen in 38 seconds

A 37.5-second, 1920×1080 launch film made only from vid2 stage nodes and a music2 cue. Seven scenes on a 128 BPM grid (1 bar = 1.875 s):
a typed command, the pitch, the brand reveal on the drop (bar 7, 11.25 s), four capability cards, the timeline file itself, the measured
hardware-encode speed-up and the install line. `build-timeline.mjs` writes `timeline.json`; the cue is `music/vid2-intro.song.json`
(the ima2-launch tech-house cue, rendered with [music2-gen](https://github.com/lidge-ai/music2-gen)).

```bash
cd "$(node examples/workspace.mjs vid2-intro)"
mkdir -p media && npx -y music2-gen render music/vid2-intro.song.json -o media/music.wav
node build-timeline.mjs                                    # writes timeline.json
vid2 validate timeline.json
vid2 preview timeline.json --at 2.5s,12.5s,15s,26s,36s --profile proxy --out out/preview
vid2 render timeline.json -o out/vid2-intro.mp4 --hw-accel if-possible
vid2 qa out/vid2-intro.mp4 --timeline timeline.json --expect-audio --out out/qa
```

The first render draws about 4,000 stage frames in JavaScript (2.5 minutes on an M5 Pro); later renders reuse the stage cache. The 70 s and
34 s bars in scene 6 are the measured software and `--hw-accel required` times for [opus-astra-paper](../opus-astra-paper/README.md).
