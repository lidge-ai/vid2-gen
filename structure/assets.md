# Assets

A `generate` source asks a provider for an image or a video clip. Rendering never calls a provider on its own: `vid2 assets resolve <timeline>`
(or `vid2 render --generate`) materializes missing assets once; every later compile or render reads the cache.

```json
"sources": { "hero": { "type": "generate", "provider": "ima2", "kind": "image", "prompt": "a glowing film strip",
                       "options": { "size": "1536x1024", "background": "opaque" } } }
```

| Command | Does |
|---|---|
| `vid2 assets providers --json` | reachability plus per-kind readiness (image ready, video disconnected, …) with the provider's reason |
| `vid2 assets resolve t.json` | generates missing assets, reports cached / generated / failed |
| `vid2 assets gen ima2 image "<prompt>" -o hero.png` | one-off generation (also cached) |
| `vid2 render t.json --generate` | resolve then render |

For a video example with a five-second Grok request on a seven-second layer, see [generated-video](../examples/generated-video/README.md). The local `file` provider can materialize an existing clip without ima2-gen; its options remain loose so offline fixtures can exercise the same render path.

**Cache.** `$VID2_HOME/cache/assets/manifest.json` maps a request hash to the file. The hash covers provider, kind, prompt, the options with
defaults filled in (image: size 1024x1024, quality high, background opaque, model `oauth/gpt-image-2` sentinel; video: 5 s, 720p, 16:9, model
`grok/grok-imagine-video-1.5`) and the **bytes** of a `seedImage` or the ordered SHA-256 values of `referenceImages`, so equal requests reuse and a changed or reordered reference regenerates. Requests without references keep their 0.2 hashes. Wait limits (`timeoutS`) are
not part of the identity. Command behaviour with a missing asset: `validate` warns, `resolve` lists it as missing, `compile`/`render` stop with
`E_INPUT` (exit 2) and the fix command, a saved `.plan.json` whose file vanished stops with `E_NOT_FOUND`. Audio is generated through
`timeline.audio` (structure/audio.md); a `generate` source of kind audio is a validation error.

## ima2-gen

vid2 drives the ima2 JSON CLI (`IMA2_BIN` or `ima2` on PATH; `IMA2_SERVER` optional). Readiness needs `capabilities --require-server` with
`source: "server"` and a selected lane whose status is `ready`; a listed model is not proof that it can generate. Images use `ima2 gen` (actual size
probed from the file), video uses `ima2 video` (Grok; text-to-video or `seedImage` first frame), `video analyze` is exposed; `video extend` is not used
because its CLI and route disagree. Failures: typed JSON first (auth → `E_ACCESS`, timeout → `E_TIMEOUT`, unreachable → `E_PROVIDER` retryable,
validation → `E_INPUT`), then ima2's exit codes (3, 4, 5, 6, 8).

For `provider: "ima2"` and `kind: "video"`, `options` accepts `durationS` (integer 1–15), `resolution` (`480p`, `720p`, `1080p`), `aspectRatio` (`1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3`, `auto`), `model`, `seedImage`, `referenceImages`, and `timeoutS`. Unknown keys fail with `E_INPUT` at `sources.<id>.options.<key>` before hashing or a provider call. `seedImage` and `referenceImages` cannot coexist. Image paths in a timeline resolve relative to its directory; `assets gen --ref` paths resolve relative to the command's working directory. Paths must be readable. File-provider options do not use this ima2 guard.

`referenceImages` is an ordered list of 1–7 paths for a `grok/` model lane, or 1–3 for another lane. Any reference list caps resolution at `720p`; one `seedImage` may use `1080p`. The adapter sends one `--ref` per image in order and adds `--as-reference` for exactly one reference. For 2–7 references, ima2 selects reference mode without that flag. On a cache miss with references, vid2 checks the installed `ima2 video --help` for `--as-reference` before generation; an older CLI fails with `E_CAPABILITY` and sends no request. A cache hit needs no ima2 probe.

vid2 explicitly passes `720p` by default although ima2's own default is `480p`. Windows absolute `--ref` paths may be parsed as `file:tag` by ima2 because they contain a colon; that path form is untested. CI uses the file provider or a fake ima2 without network. The live Grok receipt is macOS only.
