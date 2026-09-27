# Render runner

`src/render` consumes a compiled `RenderPlan`. Segment graphs are written to files, rendered concurrently with a bounded job pool, checked with ffprobe, and cached by a content hash. The runner then joins the verified segments, applies the optional post graph, encodes the final video, verifies it, and writes `<out>.render.json`.

## Profiles and encoders

`applyProfile` maps proxy to half-sized even dimensions, a 1× motion oversample and x264 ultrafast CRF 26. Final keeps the authored dimensions and 2× oversample; intermediate segments use high-quality x264, while the final encode uses the requested H.264, HEVC, VP9 or ProRes codec. MP4/MOV get `+faststart`. Software encoding is the default. `--hw` selects an available H.264 hardware encoder in videotoolbox, NVENC, QSV, AMF, VAAPI order; its quality settings are approximate and may depend on a working device.

## Cache and progress

Segment cache entries live under `cacheDir("segments")` and include the graph, inputs, font contents, profile and ffmpeg version in their key. `noCache` bypasses the cache; named `segments` force a fresh render. ffmpeg's `-progress pipe:2` reports frame, output time and speed to the caller's logger.

## Verification

ffprobe counts video packets after every segment, join and final encode. Dimensions, frame count (±1), pixel format and any explicit color range are checked; an omitted H.264 limited-range flag is accepted because ffprobe commonly leaves the default unspecified. MP4/MOV also require the `moov` atom to precede `mdat` within the first 4 MiB. A mismatch raises `E_RENDER`. The runner writes every ASS file before executing a segment. On ffmpeg 7.1+ graphs use `-/filter_complex`; older supported versions use `-filter_complex_script`.

The current IR has an opaque audio field, which must be null until the audio phase supplies a mux plan. A real two-color xfade test checks first, blended and last frame pixels, cache reuse, manifest output, and frame-count rejection.
