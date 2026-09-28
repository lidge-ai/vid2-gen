# ima2-launch — a 50-second launch film for ima2-gen, made with vid2

Every visual is built by vid2: kinetic typography, rebuilt UI (`field`, `bars`, `ticker`, `chips`), a raw `stage` scatter, `zoomfrom` and
`iris` transitions, images generated with ima2-gen, and a real capture of the ima2 web UI. The soundtrack is vid2's synth `launch` bed with
automatic effects derived from the animation. See `BRIEF.md` for the shot list.

Generated media (captures, ima2 images, renders) are not committed. To rebuild from a source checkout with ima2-gen running
(`ima2 serve`, signed in):

```bash
cd examples/ima2-launch
vid2 capture web --url http://127.0.0.1:3333 --steps ui.steps.json --size 1440x900 --scale 1.5 --out ui
vid2 assets resolve timeline.json                  # backdrop + six gallery images with ima2-gen
vid2 validate timeline.json
vid2 render timeline.json -o .work/ima2-launch.mp4
vid2 qa .work/ima2-launch.mp4 --timeline timeline.json --expect-audio --out .work/qa
vid2 compile timeline.json -o .work/film.plan.json
node check-sync.mjs .work/film.plan.json .work/ima2-launch.mp4   # cue anchors, onsets, typing cadence
```

Without ima2-gen, `vid2 render timeline.json --placeholders` renders the generated sources as labelled placeholders (the capture is still
needed; record any app with the same steps file).
