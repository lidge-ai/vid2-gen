/** UI component layers (030) → preset configs → stage specs. */
import { fpsValue } from "../../shared/index.ts";
import { SpecBuilder } from "../../stage/presets/builder.ts";
import { buildBars } from "../../stage/presets/bars.ts";
import { buildChips } from "../../stage/presets/chips.ts";
import { buildField } from "../../stage/presets/field.ts";
import { componentStyle } from "../../stage/presets/style.ts";
import type { ComponentStyle } from "../../stage/presets/style.ts";
import { buildTicker } from "../../stage/presets/ticker.ts";
import type { BuildContext, LayerOf, LayerOutput } from "../ir.ts";
import { resolveFont } from "../text/fonts.ts";
import { iconResolver, seconds } from "./kinetic.ts";
import { placeStage, stageSpan } from "./stage.ts";

type Component = LayerOf<"field"> | LayerOf<"bars"> | LayerOf<"ticker"> | LayerOf<"chips">;

function style(layer: Component): ComponentStyle {
  return componentStyle(layer.theme, layer.style ?? {});
}

function field(b: SpecBuilder, l: LayerOf<"field">, ctx: BuildContext): void {
  const s = style(l);
  buildField(b, { x: l.x, y: l.y, width: l.width, height: l.height, radius: l.radius, grow: l.grow, placeholder: l.placeholder, size: l.size,
    fontPath: resolveFont(l.font, l.weight, ctx).path, typing: l.typing.map((t) => ({ at: seconds(t.at, ctx), text: t.text, glyph: seconds(t.glyph, ctx) || 0.045 })),
    clear: l.clear === undefined ? undefined : seconds(l.clear, ctx), mask: l.mask ? { at: seconds(l.mask.at, ctx), char: l.mask.char } : undefined,
    accent: l.accent ? { color: l.accent.color ?? s.accent, decay: seconds(l.accent.decay, ctx) } : undefined, caret: l.caret,
    cursor: l.cursor ? { style: l.cursor.style, from: l.cursor.from, at: seconds(l.cursor.at, ctx), click: l.cursor.click === undefined ? undefined : seconds(l.cursor.click, ctx) } : undefined,
    style: s, duration: (l.endFrame - l.startFrame) / fpsValue(ctx.fps), move: l.move });
}

function bars(b: SpecBuilder, l: LayerOf<"bars">, ctx: BuildContext): void {
  const s = style(l);
  buildBars(b, { x: l.x, y: l.y, width: l.width, rowHeight: l.rowHeight, gap: l.gap, items: l.items, max: l.max, unit: l.unit, decimals: l.decimals,
    start: seconds(l.delay, ctx), grow: seconds(l.grow, ctx), stagger: seconds(l.stagger, ctx), countUp: l.countUp, size: l.size,
    fontPath: resolveFont(l.font, l.weight, ctx).path, style: s, barColor: l.theme === "light" ? "#C7C7CC" : "#3A3A3C" });
}

function ticker(b: SpecBuilder, l: LayerOf<"ticker">, ctx: BuildContext): void {
  const icons = iconResolver(ctx);
  buildTicker(b, { x: l.x, y: l.y, prefix: l.prefix, items: l.items.map((i) => ({ text: i.text, icon: i.icon ? icons(i.icon) : undefined })),
    start: seconds(l.delay, ctx), interval: seconds(l.interval, ctx), visible: l.visible, size: l.size, fontPath: resolveFont(l.font, l.weight, ctx).path,
    style: style(l), move: l.move });
}

function chips(b: SpecBuilder, l: LayerOf<"chips">, ctx: BuildContext): void {
  const icons = iconResolver(ctx);
  buildChips(b, { x: l.x, y: l.y, direction: l.direction, gap: l.gap, connector: l.connector, size: l.size, fontPath: resolveFont(l.font, l.weight, ctx).path,
    style: style(l), items: l.items.map((i) => ({ at: seconds(i.at, ctx), text: i.text, note: i.note, icon: i.icon ? icons(i.icon) : undefined })) });
}

/** Build a component into a spec on the context's stage clock and composite it like any stage layer. */
export function buildComponentLayer(layer: Component, ctx: BuildContext): LayerOutput {
  const b = new SpecBuilder(fpsValue(ctx.fps) * ctx.rate, ctx.scale);
  if (layer.type === "field") field(b, layer, ctx);
  else if (layer.type === "bars") bars(b, layer, ctx);
  else if (layer.type === "ticker") ticker(b, layer, ctx);
  else chips(b, layer, ctx);
  const frames = stageSpan(layer, ctx);
  const visible = (layer.endFrame - layer.startFrame) * ctx.rate;
  return placeStage(b.spec(ctx.width, ctx.height, { num: ctx.fps.num * ctx.rate, den: ctx.fps.den }, frames, frames > visible ? visible - 1 : undefined), layer, ctx);
}
