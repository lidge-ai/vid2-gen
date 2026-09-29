# Render runner

`src/render` consumes a compiled `RenderPlan`. Segment graphs are written to files, rendered concurrently with a bounded job pool, checked with ffprobe, and cached by a content hash. Before any segment it materializes the plan's stage clips (`src/render/stages.ts`, structure/stage.md): content-keyed cache in `cacheDir("stage")`, otherwise a JS frame render piped into FFV1 and verified; `renderSegments` materializes only the requested segments' `stageDeps`. The runner then joins the verified segments, applies the optional post graph, encodes the final video, verifies it, and writes `<out>.render.json`.

## Generated clip holds

When a generated video is shorter than a scene media layer, scene background, or root overlay read, the final source frame holds. The plan carries a de-duplicated `W_GENERATED_CLIP_HOLD <sourceId> <sceneId> held <h>s (<n> frames): clip <c>s, read <r>s from <in>s` warning. Root overlays use `overlays` as the scene ID. An authored `out` trim limits the requested read; `speed` and `in` are included in the hold duration. A warning needs at least one held output frame. An unknown clip duration gives no warning. Render JSON and `<out>.render.json` preserve it, including when rendering a saved `.plan.json`; older plans without warnings replay with an empty list. See [the generated-video example](../examples/generated-video/README.md).

## Profiles and encoders

`applyProfile` maps proxy to half-sized even dimensions, a 1× motion oversample and x264 ultrafast CRF 26. Final keeps the authored dimensions and 2× oversample; intermediate segments use high-quality x264, while the final encode uses the requested H.264, HEVC, VP9 or ProRes codec. MP4/MOV get `+faststart`. Software encoding is the default.

## Hardware encoding

`RenderOptions.hw` (CLI `--hw-accel disable|if-possible|required`, with `--hw` as shorthand for `if-possible`) applies to the final encode only. Segments, joins and stage clips keep their software intermediates so cache keys and quality do not depend on the host. `src/render/encoders.ts` selects the encoder once, before any segment renders, so `required` fails before long work starts.

Candidates follow the output codec: H.264 and HEVC in videotoolbox, NVENC, QSV, AMF, VAAPI order, and ProRes through `prores_videotoolbox` only. VP9/WebM has no hardware path. `--hw-encoder <family>` limits the search to one family. An encoder listed by `ffmpeg -encoders` counts only after a five-frame trial encode of a 256×144 lavfi source succeeds; results are cached per process by ffmpeg path and arguments. `if-possible` falls back to software with a warning naming the failed probes; `required` raises `E_CAPABILITY` (exit 3) with `details.tried`.

| Family | H.264 / HEVC arguments |
|---|---|
| videotoolbox | `-q:v 70` / `-q:v 74`, `yuv420p`; Intel Macs without constant quality fall back to `-b:v` at 0.15 bits per pixel per frame |
| nvenc | `-preset p5 -tune hq -rc vbr -cq 19` (HEVC 21) `-b:v 0 -spatial-aq 1` |
| qsv | `-global_quality 20` (HEVC 22), `nv12` |
| amf | `-rc cqp -qp_i 18 -qp_p 20 -quality quality` |
| vaapi | `-vaapi_device $VID2_VAAPI_DEVICE` (default `/dev/dri/renderD128`) before the inputs, `format=nv12,hwupload` at the end of the post chain, `-rc_mode CQP -qp 20` |

HEVC adds `-tag:v hvc1`; ProRes uses `-profile:v hq` with `p210le` input and still verifies as `yuv422p10le`. The VideoToolbox values were calibrated on the grain-heavy 1080p opus-astra-paper example: against a software reference, H.264 `q:v 70` scored VMAF 97.4 and HEVC `q:v 74` 97.7, while `libx264 -preset slow -crf 18` scored 97.5 at 3.5× the H.264 size. The other families use their vendors' recommended constant-quality settings and have not been measured here. Render JSON, the result object and `<out>.render.json` carry `encoder: { name, hardware }`.

## Cache and progress

A segment that reads the same file more than once (several cuts from one recording) does not seek the source repeatedly — ffmpeg could stall with every input open on one file. On a segment cache miss the runner cuts each such read into a lossless FFV1 MKV under `cacheDir("pretrim")`, keyed by the source's full content hash, the in point, the read duration and the ffmpeg version, verifies it (at least one frame, duration within one source frame, source pixel format and range kept) and feeds the cut instead. `noCache` recuts. There is no automatic prune; delete `$VID2_HOME/cache/pretrim` to reclaim space.

Every ffmpeg child runs under a stall watchdog (`src/render/watchdog.ts`). ffmpeg 8 occasionally deadlocked on a segment with ten looped inputs: the process sat idle with no CPU and no progress, and the same command finished in 15 s when rerun. When the `-progress` frame count stops advancing for `VID2_FFMPEG_STALL_MS` (default 180000), the runner kills the process. A killed segment is retried once, and a second stall fails with `E_RENDER`, `retryable: true` and `details.stalled`.

Segment cache entries live under `cacheDir("segments")` and include the graph, inputs, font contents, profile and ffmpeg version in their key. `noCache` bypasses the cache; named `segments` force a fresh render. ffmpeg's `-progress pipe:2` reports frame, output time and speed to the caller's logger.

## Verification

ffprobe counts video packets after every segment, join and final encode. Dimensions, frame count (±1), pixel format and any explicit color range are checked; an omitted H.264 limited-range flag is accepted because ffprobe commonly leaves the default unspecified. MP4/MOV also require the `moov` atom to precede `mdat` within the first 4 MiB. A mismatch raises `E_RENDER`. The runner writes every ASS file before executing a segment. On ffmpeg 7.1+ graphs use `-/filter_complex`; older supported versions use `-filter_complex_script`.

The current IR has an opaque audio field, which must be null until the audio phase supplies a mux plan. A real two-color xfade test checks first, blended and last frame pixels, cache reuse, manifest output, and frame-count rejection.
