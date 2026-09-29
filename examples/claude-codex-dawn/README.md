# claude-codex-dawn — paper puppets walking into sunrise

"Claude & Codex, at dawn" is a 74-second, 1920×1080 film. The two marks become paper puppets with googly eyes, paper arms and feet; they
meet at night, compete, work at a bench, pass checks, meet a person with a lantern and watch the sun rise. It shows how to split a longer
stage film into reusable modules: `lib.mjs` (palette, key collector, sky/sun/hills world, bubbles, captions) and `puppets.mjs` (puppet
builders and verbs such as `to`, `hops`, `wave`, `blink`, `look`). Nine scenes follow a 100 BPM cue, one bar = 2.4 s.

Logo artwork and fonts belong to their owners and are never committed. `prepare-assets.mjs` builds cutouts and shadows from files you
supply.

## Build and render

```bash
cd "$(node examples/workspace.mjs claude-codex-dawn)"
CLAUDE_SVG=/path/to/claude-spark.svg CODEX_PNG=/path/to/codex-icon.png FONT_DIR=/path/to/kopubworld-fonts node prepare-assets.mjs
node music/gen-song.mjs music/dawn.song.json
music2 render music/dawn.song.json -o media/music.wav
node build-timeline.mjs                                   # writes timeline.json
vid2 validate timeline.json
vid2 render timeline.json --profile proxy -o out/proxy.mp4
vid2 render timeline.json -o out/claude-codex-dawn.mp4 --hw
vid2 qa out/claude-codex-dawn.mp4 --timeline timeline.json --expect-audio --out out/qa
```

`prepare-assets.mjs` needs `rsvg-convert` (librsvg) and ffmpeg. `FONT_DIR` must contain the KoPubWorld Batang and Dotum TTFs listed at
the bottom of the script. `CODEX_PNG` defaults to the icon inside the ChatGPT app on macOS.
