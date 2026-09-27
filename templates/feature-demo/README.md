# Feature demo

A capture-led demo. The bundled `demo.vid2cap/` is a real recording of `site/`, so the template renders immediately after `vid2 init feature-demo`.

```bash
vid2 validate timeline.json
vid2 render timeline.json --profile proxy --placeholders -o feature-proxy.mp4
vid2 qa feature-proxy.mp4 --timeline timeline.json
```

Re-record the fixture after editing the site or steps:

```bash
vid2 capture web --serve site --steps steps.json --size 1280x720 --scale 1 --fps 15 --out demo
```

The recording keeps action labels and cursor positions. Typed text is redacted by default.
