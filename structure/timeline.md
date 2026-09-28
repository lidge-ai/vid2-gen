# Timeline v1

`src/timeline/schema.ts` defines the authored JSON contract. `schema/timeline.v1.json` is generated from it with `node scripts/schema-json.mjs` using Zod's draft 2020-12 **input** mode. The drift test checks the committed file. Objects are strict: unknown keys fail validation, including inside scenes and layers. Optional fields with defaults may be omitted by authors; the parsed `Timeline` contains their values. `output` uses Zod `prefault({})` so its nested defaults are applied.

## Shape

The root has `version: 1`, at least one `scene`, optional `output`, `beat`, `sources`, `fonts`, `markers`, global `overlays` and `effects`, and `audio`. Each scene is one segment with a duration, layers, effects, and an optional transition to the next scene. Layer types are `media`, `text`, `shape`, `overlay` and `stage` (motion graphics, structure/stage.md; its strict schema lives in `src/timeline/stage-schema.ts` and shared primitives in `primitives.ts`). `src/timeline/index.ts` is the public module boundary for the schema, `resolveTimeline`, and `validateTimeline`.

```json
{
  "version": 1,
  "output": { "fps": 30 },
  "sources": { "shot": { "type": "video", "path": "media/shot.mp4" } },
  "scenes": [
    { "id": "opening", "duration": "2s", "layers": [
      { "type": "media", "source": "shot" },
      { "type": "text", "text": "Launch", "start": "0.25s" }
    ] }
  ]
}
```

Source paths, capture session paths, and font paths resolve from the timeline file's directory (`baseDir` supplied by the caller). Built-in font IDs are `sans`, `mono`, and `serif`. A custom font entry must provide `path` or `family`; that condition is checked by Zod at runtime because JSON Schema cannot express the refinement generated here. Relational checks also enforce referenced source and font IDs, source kind compatibility, unique scene IDs, valid transitions, and nonempty text spans.

## Timing

Times are seconds as a number or strings such as `1.5s`, `1500ms`, `45f`, or `2b`. Beats require a `beat` grid. The declared grid uses BPM, optional offset, and meter; bars are one-based (`{ "bar": 3, "beat": 1 }`). A `beat.map` JSON file may supply `bpm`, `offsetFrames`, and `meter`. Markers contain a literal or bar reference. Event references are resolved through `EventResolver`, which returns an already placed frame on the timeline clock; the capture adapter owns that placement. Without an adapter, an event reference raises `E_INPUT`.

`resolveTimeline` converts positions and durations to integer frames at the output FPS. A signed event or marker offset is added as a duration and clamped to frame zero. Scene boundaries are quantized once from the exact running time: the resolver accumulates authored scene durations and overlaps in unrounded seconds (`toSeconds`, so beat and bar units stay exact), sets `startFrame = round(exactStart × fps)` and `frames = round(exactEnd × fps) − startFrame`, and derives a non-cut transition's frames as `round(exactEnd × fps) − round((exactEnd − duration) × fps)`. The join invariant `start[i] = start[i-1] + frames[i-1] - transitionOut[i-1].frames` still holds; a transition can be one frame longer or shorter depending on its position, and one that resolves to zero frames is a validation issue. Before 0.3.0 each scene was rounded on its own and beat-cut films drifted up to several frames. The `bar` unit (`"1bar"` = `meter` beats) is accepted wherever a time literal is. A moving media layer's `out` must be after `in`, at least one output frame long at its speed, and only on video or capture sources. A cut has zero overlap. Total frames are the last scene's start plus its frame count. Layer spans are scene-relative, clamped to scene length, and also reported as absolute frames and seconds. Cues and voice entries use absolute frames and seconds. Rational FPS such as `30000/1001` is retained in the resolved result.

`validateTimeline` takes a parsed `Timeline` and optional resolve options, and returns `ValidationIssue[]` (`path`, `code`, `message`). The caller can resolve it to display scene start/frame and total-duration summaries when no issues remain. Authored shape failures come from `TimelineSchema.safeParse` and should be surfaced as `E_SCHEMA` with each Zod issue path.
