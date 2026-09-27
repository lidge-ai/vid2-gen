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

**Cache.** `$VID2_HOME/cache/assets/manifest.json` maps a request hash to the file. The hash covers provider, kind, prompt, the options with
defaults filled in (image: size 1024x1024, quality high, background opaque, model `oauth/gpt-image-2` sentinel; video: 5 s, 720p, 16:9, model
`grok/grok-imagine-video-1.5`) and the **bytes** of a `seedImage`, so equal requests reuse and a changed seed regenerates. Wait limits (`timeoutS`) are
not part of the identity. Command behaviour with a missing asset: `validate` warns, `resolve` lists it as missing, `compile`/`render` stop with
`E_INPUT` (exit 2) and the fix command, a saved `.plan.json` whose file vanished stops with `E_NOT_FOUND`. Audio is generated through
`timeline.audio` (structure/audio.md); a `generate` source of kind audio is a validation error.

## ima2-gen

vid2 drives the ima2 JSON CLI (`IMA2_BIN` or `ima2` on PATH; `IMA2_SERVER` optional). Readiness needs `capabilities --require-server` with
`source: "server"` and a selected lane whose status is `ready`; a listed model is not proof that it can generate. Images use `ima2 gen` (actual size
probed from the file), video uses `ima2 video` (Grok; text-to-video or `seedImage` first frame), `video analyze` is exposed; `video extend` is not used
because its CLI and route disagree. Failures: typed JSON first (auth → `E_ACCESS`, timeout → `E_TIMEOUT`, unreachable → `E_PROVIDER` retryable,
validation → `E_INPUT`), then ima2's exit codes (3, 4, 5, 6, 8).
