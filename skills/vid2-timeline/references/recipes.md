# Small recipes

## Hero still before motion

Resolve or generate a real product still, verify image dimensions and crop, then use a 4 s scene with `media.fit:"blurfill"` and camera keys `[{"at":"0s","zoom":1},{"at":"4s","zoom":1.08}]`. Put one 72–96 px headline on top. Preview 0, 2 and 3.9 s before adding another effect.

## Capture on the click

Record a `save` label. Use a capture source in a media layer with `camera:{"auto":"events"}`, and cue `{"at":{"event":"save"},"sfx":"preset:click","anchor":"start"}`. Resolve frames and inspect the click before cutting; the action and video frame share the same quantization.

## Generated asset cache

Declare a `generate` source for an image or Grok clip. Run `vid2 validate timeline.json --json` to see uncached generate-source warnings and `vid2 assets providers --json` to check readiness. When generation is authorized and the lane is ready, `vid2 assets resolve timeline.json --json` materializes missing assets and may call the provider. `vid2 render` consumes cached media; `--placeholders` substitutes labelled stripes for uncached sources during a structural render.

## QA waiver

`"qa":{"waive":[{"check":"black","from":"0s","to":"0.4s","reason":"intentional fade from black"}]}`. Keep ranges shorter than the actual intentional effect. Inspect the video and QA measurement first.

## ima2 hero still, cutout, and seeded Grok clip

First run `vid2 assets providers --json`. The `ima2` entry must show the selected image or video kind as available and ready; an installed CLI or healthy server alone is insufficient. For a hero, run `vid2 assets gen ima2 image "real product on a calm desk, generous space for headline" --size 1536x1024 --quality high -o assets/hero.png --json`. Inspect the saved file's actual dimensions, crop and artifacts before adding it as an image source; requested size may differ from actual output.

For a cutout, run `vid2 assets gen ima2 image "isolated product, clean silhouette" --background transparent --size 1024x1024 -o assets/cutout.png --json`. Verify alpha around edges against both light and dark backgrounds. If transparency is unavailable, `--background chroma-green` is an alternative for a media layer's `chroma` settings, but inspect spill; do not treat green as alpha.

For motion continuity, first approve a still, then run `vid2 assets gen ima2 video "slow push toward product, no text or logo changes" --model grok/grok-imagine-video-1.5 --duration 5 --resolution 720p --aspect-ratio 16:9 --seed-image assets/hero.png -o assets/hero-motion.mp4 --json`. `--seed-image` maps to ima2's opening-frame reference. Probe the saved clip, inspect first and last frames, motion, duration and logo fidelity before using it. A provider may return a revised prompt; keep the returned metadata. Video generation is a separate explicit action; render consumes cached assets and never silently retries a provider.
