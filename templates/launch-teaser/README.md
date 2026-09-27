# Launch teaser

A 30-second, 16:9 product launch sequence with a generated hero image and a synthesized launch bed. The image is intentionally uncached so `--placeholders` can render the template immediately.

```bash
vid2 validate timeline.json
vid2 render timeline.json --profile proxy --placeholders -o teaser-proxy.mp4
vid2 qa teaser-proxy.mp4 --timeline timeline.json
```

Edit `BRIEF.md` first, then replace the copy and image prompt in `timeline.json`. Generate the real asset with `vid2 assets resolve timeline.json` before the final render.
