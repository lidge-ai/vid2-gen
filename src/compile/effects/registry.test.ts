import assert from "node:assert/strict";
import { test } from "node:test";
import { runChecked } from "../../shared/index.ts";
import { locateTools } from "../../probe/index.ts";
import { requireFfmpeg } from "../../../tests/helpers.ts";
import type { ResolvedEffect } from "../../timeline/index.ts";
import type { EffectContext } from "../ir.ts";
import { EFFECTS, effectFilters, internalRateFor, requiredFilters } from "./registry.ts";

const scene: EffectContext = { fps: { num: 30, den: 1 }, rate: 3, frames: 90, width: 320, height: 180, clock: "segment" };
const post: EffectContext = { ...scene, rate: 1, clock: "absolute-t" };

void test("registry derives rate and conditional capability requirements", () => {
  const effects: ResolvedEffect[] = [
    { type: "motionblur", frames: 3 },
    { type: "grade", brightness: 0, contrast: 1, saturation: 1, lut: "grade.cube", temperature: 6500 },
    { type: "motionblur", frames: 5 },
  ];
  assert.deepEqual(Object.keys(EFFECTS), ["grade", "motionblur", "vignette", "grain", "flash", "rgbsplit"]);
  assert.equal(internalRateFor(effects), 5);
  assert.equal(internalRateFor([]), 1);
  assert.deepEqual(new Set(requiredFilters(effects)), new Set(["tmix", "fps", "eq", "lut3d", "colortemperature"]));
  assert.ok(requiredFilters().includes("rgbashift"));
  assert.deepEqual(requiredFilters([]), []);
});

void test("scene effects build escaped, bounded filter options", () => {
  const grade: ResolvedEffect = { type: "grade", brightness: 0.1, contrast: 1.2, saturation: 0.8,
    lut: "C:\\show\\grade.cube", temperature: 6500 };
  const filters = effectFilters(grade, scene);
  assert.match(filters[0] ?? "", /^eq=brightness=0\.1:contrast=1\.2:saturation=0\.8$/);
  assert.equal(filters[1], "colortemperature=temperature=6500");
  assert.match(filters[2] ?? "", /lut3d=file=.*C.*grade\.cube/);
  assert.deepEqual(effectFilters({ type: "motionblur", frames: 3 }, scene), ["tmix=frames=3", "fps=30/1"]);
  assert.match(effectFilters({ type: "vignette", strength: 0.3 }, scene)[0] ?? "", /vignette=angle=/);
  assert.equal(effectFilters({ type: "grain", strength: 3 }, scene)[0], "noise=alls=3:allf=t");
});

void test("PostPlan timed effects use absolute t and no n expression", () => {
  const timed: ResolvedEffect[] = [
    { type: "flash", at: "2s", strength: 0.5, decay: 12, atFrame: 60, atSeconds: 2, absoluteAtFrame: 120, absoluteAtSeconds: 4 },
    { type: "rgbsplit", at: "2s", frames: 3, px: 12, atFrame: 60, atSeconds: 2, absoluteAtFrame: 120, absoluteAtSeconds: 4 },
  ];
  const postFilters = timed.flatMap((effect) => effectFilters(effect, post));
  assert.ok(postFilters.every((filter) => !/\bn\b/.test(filter)));
  assert.match(postFilters[0] ?? "", /gte\(t,4\)/);
  assert.match(postFilters[1] ?? "", /between\(t,4,/);
  assert.match(effectFilters(timed[1]!, scene)[0] ?? "", /between\(n,180,188\)/);
});

void test("live flash filter visibly brightens its target frame", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ffmpeg } = locateTools();
  const flash: ResolvedEffect = { type: "flash", at: "1f", strength: 0.35, decay: 12,
    atFrame: 1, atSeconds: 1 / 30, absoluteAtFrame: 1, absoluteAtSeconds: 1 / 30 };
  const filters = effectFilters(flash, { ...scene, rate: 1 }).join(",");
  const result = await runChecked(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi",
    "-i", "color=c=gray:s=32x32:r=30", "-vf", filters, "-frames:v", "3",
    "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"]);
  assert.equal(result.stdout.length, 32 * 32 * 3);
  const before = result.stdout[0]!;
  const during = result.stdout[32 * 32]!;
  assert.ok(during > before + 30, `flash frame ${during} did not brighten baseline ${before}`);
});

void test("live post rgbsplit changes only its absolute-t window", async (t) => {
  if (!requireFfmpeg(t)) return;
  const { ffmpeg } = locateTools();
  const effect: ResolvedEffect = { type: "rgbsplit", at: "1f", frames: 2, px: 4,
    atFrame: 1, atSeconds: 1 / 30, absoluteAtFrame: 1, absoluteAtSeconds: 1 / 30 };
  const filter = effectFilters(effect, post).join(",");
  const result = await runChecked(ffmpeg, ["-hide_banner", "-loglevel", "error", "-f", "lavfi",
    "-i", "smptebars=s=64x64:r=30", "-vf", filter, "-frames:v", "4",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);
  const size = 64 * 64 * 3;
  assert.equal(result.stdout.length, size * 4);
  const frame = (index: number) => result.stdout.subarray(index * size, (index + 1) * size);
  assert.equal(frame(0).equals(frame(3)), true, "frames outside effect window should match");
  assert.equal(frame(0).equals(frame(1)), false, "first effect frame should visibly change");
  assert.equal(frame(0).equals(frame(2)), false, "last effect frame should visibly change");
});
