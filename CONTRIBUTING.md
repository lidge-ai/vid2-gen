# Contributing

Thanks for helping build vid2-gen. Please open an issue before changing the public timeline shape or adding a runtime dependency.

## Set up

Install Node.js 22.18+ and ffmpeg/ffprobe 6.1+, then run:

```bash
npm ci
npm run build
node bin/vid2.js doctor --json
```

Source TypeScript uses ESM and `.ts` relative imports; build output rewrites those imports to `.js`. Follow the owning [structure document](structure/INDEX.md). Keep JSON command output and exit codes stable, and update the schema file when changing the zod timeline.

## Verify

```bash
npm run typecheck
npm run lint
npm run build
npm test
npm run schema:json
npm run privacy:scan
```

Run `node --test path/to/file.test.ts` for focused work. CI tests on Linux, macOS, and Windows with Node 22 and 24, and separately installs an npm tarball outside the checkout.

## Pull requests

Use conventional commits such as `feat(timeline): add markers` or `fix(probe): handle missing encoder`. Keep each PR focused. Describe the behavior, tests run, and any platform limits. Include a before/after CLI example for public command changes. Update the relevant `structure/` document and active devlog plan. Never include credentials, personal data, or generated video outputs in the branch.
