# Changelog

A 20-second, three-item release film. The alternation of ink, paper, brass, and blue provides contrast between changes while the mono numbering holds the sequence together.

```bash
vid2 validate timeline.json
vid2 render timeline.json --profile proxy --placeholders -o changelog-proxy.mp4
vid2 qa changelog-proxy.mp4 --timeline timeline.json
```
