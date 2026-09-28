# Kinetic launch

A 30-second, 16:9 launch film built only from vid2 motion layers: `field` (typing into a growing pill), `kinetic` (word builds, magic
move, highlight sweep, icon expand), `chips`, `bars`, `ticker`, and the `iris` and `zoomfrom` transitions, over a synthesized launch bed
with automatic sound effects. The two generated images render as placeholders until you resolve them.

```bash
vid2 validate timeline.json
vid2 render timeline.json --profile proxy --placeholders -o proxy.mp4
vid2 qa proxy.mp4 --timeline timeline.json
vid2 assets resolve timeline.json          # generates backdrop + hero with ima2-gen
vid2 render timeline.json -o launch.mp4
```

Read `BRIEF.md` first. The motion grammar behind the defaults is in the `vid2-direction` skill (`references/kinetic-grammar.md`).
