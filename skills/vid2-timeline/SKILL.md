---
name: vid2-timeline
description: Use for authoring, debugging, or explaining a vid2 v1 timeline. Triggers include scenes, layers, sources, markers, events, beat timing, camera keys, transitions, QA waivers, and schema errors.
---

# Timeline v1

Author the smallest strict JSON timeline that expresses the edit. Unknown fields are errors. Read [field-by-field schema](references/schema.md), [time and event clocks](references/time.md), [error-to-fix table](references/errors.md), and [recipes](references/recipes.md) as needed. The packaged [JSON Schema](assets/timeline.v1.json) is generated from the current Zod input schema.

Run `vid2 schema --json` to inspect the installed schema, `vid2 validate timeline.json --json` for authored and relational checks, then `vid2 resolve timeline.json --json` to inspect absolute frames before preview or render. A valid timeline may still need local files, a capture session, or generated assets. The resolved output is evidence for cuts and event placement; do not estimate frame positions from prose.

Choose one timing clock for each decision: scene-relative spans for layers, absolute timeline time for cues and global effects, footage time for capture layer `in`/`out`. `2b` requires a beat grid. A cut has zero overlap; a non-cut transition overlaps the following scene by its duration. See [time](references/time.md).
