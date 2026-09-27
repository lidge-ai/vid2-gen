# 001 — Repository conventions borrowed from opencodex

Source: read-only sol explorer survey of opencodex (2026-09-27). Anchors are opencodex paths.

## a. Top-level inventory

| Files | Purpose |
|---|---|
| `package.json`, `bun.lock`, `tsconfig.json`, `bunfig.toml` | Package, locked dependencies, strict TypeScript configuration, and Bun test discovery. `package.json:2-18,36-49`; `tsconfig.json:2-15`; `bunfig.toml:1-3` |
| `README.md`, `AGENTS.md`, `AGENTS_INSTALL.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE` | User guide, contributor/agent rules, separate operating-agent rules, contribution contract, private vulnerability reporting, MIT license. `README.md:90-95,435-463,475-477`; `AGENTS.md:1-3`; `AGENTS_INSTALL.md:1-5`; `CONTRIBUTING.md:1-11`; `SECURITY.md:16-27`; `LICENSE:1` |
| `MAINTAINERS.md`, `CREDITS.md`, `SPONSORS.md`, `design-debt.md` | Governance, attribution, sponsorship, and scoped debt inventory. `MAINTAINERS.md:1-6`; `CREDITS.md:1,33`; `SPONSORS.md:1,18`; `design-debt.md:1-5` |
| `.gitignore`, `.npmignore`, `.gitattributes`, `.dockerignore`, `Dockerfile`, `compose.yaml`, `.coderabbit.yaml` | Local exclusions, npm package exclusions, line endings/binary markers, container build context and deployment, review bot policy. `.gitignore:1-5`; `.npmignore:1-9`; `.gitattributes:1-10`; `.dockerignore:1-8`; `Dockerfile:1-6`; `compose.yaml:1-3`; `.coderabbit.yaml:1-10` |

The observed `.DS_Store` and `.dirfd-probe-*` files are ignored local debris, not scaffold inputs. `.gitignore:5,34-39`

## b. `AGENTS.md`

Its sections progress through product and repository layout, optional subsystem boundaries, devlog and security rules, consent actions, commands, CI limitations, container notes, issue/PR policy, branches, and review rules. `AGENTS.md:5,12,55,99,127,162,193,246,295,326,367,426`

Transfer the concise rules: “Read the nearest nested `AGENTS.md`” (`AGENTS.md:52-53`); changing an owned source area requires reviewing its structure doc (`AGENTS.md:37-45`); record exact tests and limits instead of claiming unrun suites passed (`AGENTS.md:220-240`); keep unreleased security notes in ignored scratch (`AGENTS.md:127-139`). The long optional-Lab and account-consent sections are product-specific. `AGENTS.md:55-97,162-191`

## c. `structure/` source of truth

`INDEX.md` orders current architecture docs in six tiers: foundation (`overview.md`, `runtime.md`); configuration/catalog; data planes/transports; providers/adapters; surfaces/clients; operations/process. `structure/INDEX.md:10-96` The manifest records each doc’s tier, scope, and source areas; its `sizeBudgetLines` is 600. `structure/manifest.json:2-3,17-55`

`structure/INDEX.md` is generated from `manifest.json`. `scripts/structure-ssot.ts` renders it with `--fix` and otherwise checks manifest parity, tracked paths, links/anchors, source coverage, decision records, and invariant-to-test bindings. `structure/INDEX.md:3-8`; `scripts/structure-ssot.ts:3-24,631-665`; `structure/AGENTS.md:123-151` For vid2-gen, a hand-maintained `structure/overview.md` plus a short index may be enough until multiple subsystem docs make generated ownership checks useful.

## d. `devlog/`

Open units live under `devlog/_plan/YYMMDD_slug/`; numbered documents commonly use `000` for the problem/plan and `010`, `020`, `030` for work phases. `devlog/README.md:24-29`; `devlog/_plan/260914_l2_pool_routing_cache/000_unit.md:37-43` Move a unit to `_fin/` after recording `DONE`, `NOOP`, `BLOCKED`, or `NEEDS_HUMAN` and its reason. `devlog/README.md:20-29` `_chase/` holds external parity references. `devlog/README.md:29`

One inconsistency to avoid copying: `devlog/README.md:53-59` still describes submodule hygiene, while the root agent guide explicitly says devlog is tracked directly. `AGENTS.md:99-110`

## e. CI and release

The primary **Cross-platform CI** runs on every PR, selected `main`/`preview` pushes, and manual dispatch. It has four Ubuntu test shards, a gates job for typecheck/GUI lint/privacy, separate structure and privacy checks, conditional macOS shards, manually dispatched Windows shards, npm global-install smoke, and an aggregate `ci` result. `.github/workflows/ci.yml:1-59,468-480,605-645,680-697,835-881,1098-1117,1196-1215,1217-1276,1490-1498` Release is a manually dispatched workflow with preflight, five standalone targets, desktop bundles, verification, and publish. `.github/workflows/release.yml:1-33,92-142,227-248,563-564,736-747`

Publication pins an expected SHA, checks dependency audit and version sources, builds release notes, then uses npm Trusted Publishing with OIDC (`id-token: write`) and automatic provenance; the first package version needs a separate initial publish before trusted publishing can be configured. `.github/workflows/release.yml:754-806,921-926,1013-1028,1030-1058` It creates a `v<version>` tag and draft GitHub Release after npm publication, then attaches verified assets. `.github/workflows/release.yml:1126-1167,629-694` Changelog categories are label-driven. `.github/release.yml:1-20`

Other workflows cover PR/issue hygiene, docs, service/desktop checks, branch/run cleanup, labels, and version bump; these are scale-specific. `.github/workflows/pr-hygiene.yml:1-4`; `.github/workflows/enforce-issue-quality.yml:1-13`; `.github/workflows/deploy-docs.yml:1-9`; `.github/workflows/dev-version-bump.yml:23-25`

## f. Tests and quality tooling

Tests are `tests/<domain>/*.test.ts`, with helpers and fixtures; `scripts/test-layout/layout.json` enforces placement. `AGENTS.md:14-27`; `scripts/test-layout/layout.json:1-11` `npm test` delegates to `scripts/test.ts`, which isolates home/temp/credentials, supports changed-test selection, bounds parallelism, and separates risky files into serial lanes. `package.json:47-49`; `scripts/test.ts:25-39,50-69,91-103,338-357,360-370,417-440`

Root typecheck uses strict `tsc --noEmit`; the root package has GUI lint commands but no general lint or formatter script. `tsconfig.json:2-15`; `package.json:42-76` The file-size ratchet rejects new files at 2,000 lines and growth above a recorded cap; its baseline can only decrease. `scripts/file-size-ratchet.ts:4-19,114-129,181-196`; `AGENTS.md:253-257` The privacy scanner checks tracked text and redacts sensitive findings in CI output. `scripts/privacy-scan.ts:10-16,369-430`

## g. README shape

It starts with a banner/tagline, npm/license/Node badges, immediate install commands and platform downloads. `README.md:1-26` Then come product demos, language links, quick start, supported platforms, highlights, routing, providers, CLI, remote access, documentation, development, disclaimer, and license. `README.md:28-90,265,277,334,362,371,428,435,450,469,475` For a new CLI, keep the npm/license/Node badges and install-first opening; defer the demos, translation links, and platform asset badges.

## h. Skip for a small CLI

Do not copy the Bun runtime bundling, GUI/Tauri/WidgetKit, six-tier manifest generator, four-shard runner, test-layout registry, file-size baseline, release resume machinery, or the many issue/PR automation workflows merely for symmetry. They address OpenCodex’s actual complexity. `package.json:18-34,60-75`; `AGENTS.md:14-48`; `structure/INDEX.md:10-96`; `.github/workflows/ci.yml:468-480`; `.github/workflows/release.yml:23-33,227-248`

A minimal clean starting tree, **subject to the parent’s CLI design judgment**:

```text
vid2-gen/
├── .github/workflows/ci.yml
├── .github/workflows/release.yml
├── .gitignore
├── .gitattributes
├── AGENTS.md
├── CONTRIBUTING.md
├── LICENSE
├── README.md
├── SECURITY.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── bin/vid2.js
├── src/cli.ts
├── src/config.ts
├── src/commands/
├── src/shared/
├── tests/
│   ├── cli.test.ts
│   └── package.test.ts
├── structure/overview.md
└── devlog/
    ├── _plan/
    └── _fin/
```

Use a `package.json` `files` allowlist and a CI `npm pack`/global-install smoke to prove the published CLI works on plain Node; those are the most directly transferable packaging checks. `package.json:14-35`; `.github/workflows/ci.yml:1251-1276` Open judgments for the parent: whether to add a separate build script and `dist/`, whether to keep `dev`/`main` release branches, and whether vid2-gen’s scope warrants generated structure checks or release notes automation. `tsconfig.json:11-15`; `AGENTS.md:367-372`; `structure/INDEX.md:3-8`; `.github/workflows/release.yml:1013-1028`

Read-only survey complete; no files or Git state were changed.

