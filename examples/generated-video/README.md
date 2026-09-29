# Generated video clip

`timeline.json` requests a five-second Grok clip through ima2-gen and reads it for a seven-second scene. The final two seconds hold the clip's last frame. The render JSON and `<out>.render.json` report one `W_GENERATED_CLIP_HOLD` warning for `grok_clip boat_hold`.

In its workspace, with a ready Grok video lane in ima2-gen:

```bash
cd "$(vid2 example new generated-video)"
vid2 assets providers --json
vid2 validate timeline.json --json
vid2 assets resolve timeline.json --json
vid2 render timeline.json --profile proxy -o generated-video.mp4 --json
vid2 qa generated-video.mp4 --timeline timeline.json --json
```

Generation may use a paid provider request on a cache miss. A render without `--generate` reads the cached clip and does not call ima2-gen. Use `--generate` only when that provider request is intended.

`timeline.offline.json` has the same seven-second read through the local `file` provider. Put a five-second MP4 at `generated-clip.mp4` beside the timeline, then run `vid2 render timeline.offline.json --generate --profile proxy -o offline.mp4 --json`. The e2e test makes this file from ffmpeg's `testsrc2` in a temporary directory. Neither the generated clip nor rendered output is committed.
