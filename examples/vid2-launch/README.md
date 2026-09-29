# vid2-launch — the launch video, made with vid2

A 30-second, 1920×1080 launch video: two real web captures (a code page and the feature-demo app), three ima2-gen stills, synthesized
audio and a scene of QA evidence produced by vid2 itself in a first pass. The captures, stills and QA images live in the workspace, not in
git; the table below lists the command that makes each one.

```bash
cd "$(vid2 example new vid2-launch)"
vid2 init feature-demo .work/feature-demo --force
vid2 capture web --serve code-page --steps code-page.steps.json --size 1280x720 --scale 1.5 --out code
vid2 capture web --serve .work/feature-demo/site --steps app.steps.json --size 1280x720 --scale 1.5 --out app
vid2 validate timeline.stills.json
vid2 render timeline.stills.json --profile proxy --placeholders -o .work/pass1.mp4
vid2 qa .work/pass1.mp4 --timeline timeline.stills.json --out .work/pass1.qa
node make-qa-media.mjs .work/pass1.qa media
vid2 preview timeline.stills.json --at 1s,7.5s,15s,27s --placeholders
vid2 render timeline.stills.json --profile proxy --placeholders -o .work/proxy.mp4
vid2 qa .work/proxy.mp4 --timeline timeline.stills.json
vid2 render timeline.stills.json --placeholders -o .work/vid2-launch.mp4
```

Pass 1 renders with placeholders so its QA evidence (seam grid, waveform, spectrogram) can become the scene-7 media. The three stills
(`media/hero.jpg`, `media/still-a.jpg`, `media/still-b.jpg`) stay labelled placeholders until you make them with ima2-gen (table
below); then drop `--placeholders` from the last two renders.

How it was made (all commands are real and repeatable):

| Piece | Workspace path | Command |
|---|---|---|
| code capture | `code.vid2cap/` | `vid2 capture web --serve code-page --steps code-page.steps.json --size 1280x720 --scale 1.5 --out code` |
| app capture | `app.vid2cap/` | `vid2 capture web --serve .work/feature-demo/site --steps app.steps.json --size 1280x720 --scale 1.5 --out app` |
| stills | `media/hero.jpg`, `media/still-a.jpg`, `media/still-b.jpg` | `vid2 assets gen ima2 image "<prompt>" --size 1536x1024` (prompts in devlog 070), converted to JPEG |
| render log shown on the code page | `code-page/render-log.json` (committed) | `vid2 render demo/timeline.json --profile proxy --json` of `vid2 init launch-teaser demo` with its hero source set to `media/hero.jpg` (paths removed) |
| QA evidence in scene 7 | `media/qa-*.png` | pass 1 `vid2 render timeline.stills.json --profile proxy --placeholders -o .work/pass1.mp4` → `vid2 qa .work/pass1.mp4 --timeline timeline.stills.json --out .work/pass1.qa` → `node make-qa-media.mjs .work/pass1.qa media` (seam grid, waveform, spectrogram) |

Without ima2-gen, `--placeholders` renders the three stills as labelled stripes. `timeline.stills.json` uses stills because the Grok
video lane was not signed in; a Grok variant can replace the hero shot with an image-to-video clip.
