# vid2-launch — the launch video, made with vid2

```bash
cd examples/vid2-launch
vid2 validate timeline.stills.json
vid2 preview timeline.stills.json --at 1s,7.5s,15s,27s --placeholders
vid2 render timeline.stills.json --profile proxy -o .work/proxy.mp4
vid2 qa .work/proxy.mp4 --timeline timeline.stills.json
vid2 render timeline.stills.json -o .work/vid2-launch.mp4
```

How it was made (all commands are real and repeatable):

| Piece | Command |
|---|---|
| code capture | `vid2 capture web --serve code-page --steps code-page.steps.json --size 1280x720 --scale 1.5 --out code` |
| app capture | `vid2 capture web --serve ../../templates/feature-demo/site --steps app.steps.json --size 1280x720 --scale 1.5 --out app` |
| stills | `vid2 assets gen ima2 image "<prompt>" --size 1536x1024` (prompts in devlog 070), converted to JPEG |
| render log shown on the code page | `vid2 init launch-teaser demo && vid2 render demo/timeline.json --profile proxy --placeholders --json` (paths removed) |
| QA stills in scene 7 | pass 1 `vid2 render --placeholders` → `vid2 qa` → contact sheet and the `compile` seam stills copied to `media/` |

`timeline.stills.json` uses stills because the Grok video lane was not signed in; a Grok variant can replace the hero shot with an image-to-video clip.
