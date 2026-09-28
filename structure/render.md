# Render runner

`src/render` consumes a compiled `RenderPlan`. Segment graphs are written to files, rendered concurrently with a bounded job pool, checked with ffprobe, and cached by a content hash. Before any segment it materializes the plan's stage clips (`src/render/stages.ts`, structure/stage.md): content-keyed cache in `cacheDir("stage")`, otherwise a JS frame render piped into FFV1 and verified; `renderSegments` materializes only the requested segments' `stageDeps`. The runner then joins the verified segments, applies the optional post graph, encodes the final video, verifies it, and writes `<out>.render.json`.

## Profiles and encoders

`applyProfile` maps proxy to half-sized even dimensions, a 1× motion oversample and x264 ultrafast CRF 26. Final keeps the authored dimensions and 2× oversample; intermediate segments use high-quality x264, while the final encode uses the requested H.264, HEVC, VP9 or ProRes codec. MP4/MOV get `+faststart`. Software encoding is the default. `--hw` selects an available H.264 hardware encoder in videotoolbox, NVENC, QSV, AMF, VAAPI order; its quality settings are approximate and may depend on a working device.

## Cache and progress

A segment that reads the same file more than once (several cuts from one recording) does not seek the source repeatedly — ffmpeg could stall with every input open on one file. On a segment cache miss the runner cuts each such read into a lossless FFV1 MKV under `cacheDir("pretrim")`, keyed by the source's full content hash, the in point, the read duration and the ffmpeg version, verifies it (at least one frame, duration within one source frame, source pixel format and range kept) and feeds the cut instead. `noCache` recuts. There is no automatic prune; delete `$VID2_HOME/cache/pretrim` to reclaim space.

Every ffmpeg child runs under a stall watchdog (`src/render/watchdog.ts`). ffmpeg 8 occasionally deadlocked on a segment with ten looped inputs: the process sat idle with no CPU and no progress, and the same command finished in 15 s when rerun. When the `-progress` frame count stops advancing for `VID2_FFMPEG_STALL_MS` (default 180000), the runner kills the process. A killed segment is retried once, and a second stall fails with `E_RENDER`, `retryable: true` and `details.stalled`.

Segment cache entries live under `cacheDir("segments")` and include the graph, inputs, font contents, profile and ffmpeg version in their key. `noCache` bypasses the cache; named `segments` force a fresh render. ffmpeg's `-progress pipe:2` reports frame, output time and speed to the caller's logger.

## Verification

ffprobe counts video packets after every segment, join and final encode. Dimensions, frame count (±1), pixel format and any explicit color range are checked; an omitted H.264 limited-range flag is accepted because ffprobe commonly leaves the default unspecified. MP4/MOV also require the `moov` atom to precede `mdat` within the first 4 MiB. A mismatch raises `E_RENDER`. The runner writes every ASS file before executing a segment. On ffmpeg 7.1+ graphs use `-/filter_complex`; older supported versions use `-filter_complex_script`.

The current IR has an opaque audio field, which must be null until the audio phase supplies a mux plan. A real two-color xfade test checks first, blended and last frame pixels, cache reuse, manifest output, and frame-count rejection.
