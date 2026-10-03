# Production references and evidence limits

Opened 2026-10-03 through two Aside exec public-research sessions. Sources inform choreography, not code/media copying. Main also opened the official Remotion prompt showcase/templates and Motion Canvas homepage. No runtime dependency is added.

| Example | Source | Evidence and transferable pattern |
|---|---|---|
| Remotion Hello World | [preview](https://remotion-helloworld.vercel.app/?/HelloWorld), [title source](https://github.com/remotion-dev/template-helloworld/blob/main/src/HelloWorld/Title.tsx) | Aside inspected rendered states and source: words enter with source-defined five-frame offsets inside reserved layout; a shared parent fades the content. |
| GitHub Unwrapped | [project/source](https://github.com/remotion-dev/github-unwrapped), [showcase](https://www.remotion.dev/showcase) | Large statistics and whitespace in sampled video states. Main-branch source overlaps scenes; showcased 2023 and repository 2024 versions differ, so code is not exact video provenance. |
| Motion Canvas Smooth Parallax | [pinned source](https://github.com/motion-canvas/examples/tree/8ffefed144368d33de4b0e451894c718eb95d574/examples/smooth-parallax), [creator video](https://youtu.be/c_3TLN2gHow) | Source-only: named cues separate narration holds from entrance/exit motion; geometry derives zoom targets. No visual playback claim. |
| Motion Canvas open-source film | [pinned scene source](https://github.com/motion-canvas/examples/blob/8ffefed144368d33de4b0e451894c718eb95d574/examples/motion-canvas/src/scenes/signals.tsx), [creator video](https://youtu.be/H5GETOP7ivs) | Source-only: connector propagation precedes destination activation, then grouped exit cancels ongoing work. |
| ELASTIC typography | [live](https://ashborn-047.github.io/kinetic-typography/experiments/elastic.html), [source](https://github.com/Ashborn-047/kinetic-typography/blob/main/experiments/elastic.html) | Aside inspected interaction states: cursor-local glyph deformation returns to baseline. It is an interactive tween study, not a timed spring video. |
| Creativly product film | [creator repository](https://github.com/naveen-annam/creativly.ai-brand-video-remotion), [orchestration](https://github.com/naveen-annam/creativly.ai-brand-video-remotion/blob/main/src/BrandVideo.tsx) | Aside sampled product/UI/end-card states and read scene code. Main inspected the sampled pipeline composition. No full-playback, measured-easing or audio-sync claim. |

## Adopted decisions

Use authored cumulative seconds and quantize each onset once. [Motion stagger](https://motion.dev/docs/stagger) describes per-item delays; [Remotion frame clock](https://www.remotion.dev/docs/use-current-frame) supplies a frame-indexed comparison. Test deterministic frames independently of visitation order where existing renderer tests already own this.

Reserve final text geometry; separate entrance, readable hold and exit. The example's timings and gutters are local design choices, not measurements lifted from these films. UI duration numbers in [legacy Material guidance](https://m1.material.io/motion/duration-easing.html) are not universal video rules.

Use sparse contact sheets for overview, exact event/boundary samples for short motion, and actual playback for rhythm. [FFmpeg select/tile documentation](https://ffmpeg.org/ffmpeg-filters.html) distinguishes frame selection from frame-rate conversion; a few thumbnails cannot certify every transition frame.

Stage title-safe QA should warn at sampled opaque holds. It does not certify all-state layout, collisions, motion settling, contrast throughout a hold, audio quality or accessibility compliance. Keep those limits in packaged guidance.

## Provenance cautions

Browser snapshots are sampled observations, not full-video viewing. Code and showcase versions can diverge. No third-party media or source implementation is copied into the package. Research screenshots remain uncommitted task artifacts. Aside's second execution log records one internal message to the first research session despite its final no-message summary; main treats the log as authoritative and does not repeat that blanket claim.
