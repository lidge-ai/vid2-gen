# vid2-intro — vid2-gen, quietly

A 36-second, 1920×1080 product film in a keynote grammar: a black canvas, one sentence per scene, two greys and white, long ease-out
arrivals with a soft focus pull, no glows, cards or springs. Seven scenes: the premise, the name, one real command typed in a terminal,
four verbs lit one at a time, a rolling number for the hardware-encode speed-up, who it is for, and the install line. The piano cue
(`music/vid2-intro.song.json`, 80 BPM so one bar is exactly 3 s) is rendered with [music2-gen](https://github.com/lidge-ai/music2-gen);
`build-timeline.mjs` writes `timeline.json`. Every visual is a vid2 stage node.

```bash
cd "$(vid2 example new vid2-intro)"
mkdir -p media && npx -y music2-gen render music/vid2-intro.song.json -o media/music.wav
node build-timeline.mjs                                    # writes timeline.json
vid2 validate timeline.json
vid2 preview timeline.json --at 3.6s,7.5s,12.5s,17s,25s,34s --profile proxy --out out/preview
vid2 render timeline.json -o out/vid2-intro.mp4 --hw-accel if-possible
vid2 qa out/vid2-intro.mp4 --timeline timeline.json --expect-audio --out out/qa
```

The 34 s in the number roll is the measured `--hw-accel required` time for [opus-astra-paper](../opus-astra-paper/README.md); this film
itself renders in about 25 s with hardware encoding. QA reports a contrast warning on the verbs scene by design: the three unlit words
are dimmed to about 2.6:1 so the lit word leads.

The piano is *Salamander Grand Piano V3* by Alexander Holm (CC BY 3.0), bundled with music2-gen; credit it wherever the film is published.
