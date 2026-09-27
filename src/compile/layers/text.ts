/** ASS runs are applied between ordinary layers at their authored position. */
import { join } from "node:path";
import { escapePath } from "../escape.ts";
import { requireFeatures } from "../../probe/index.ts";
import type { FfmpegInfo } from "../../probe/index.ts";
import type { BuildContext, LayerOf, SceneText } from "../ir.ts";
import { buildAss } from "../text/ass.ts";

/** Call once before compiling any text run; missing libass is a capability error. */
export function requireTextCapability(info: FfmpegInfo): void {
  requireFeatures(info, { filters: ["ass"], libs: ["ass"] }, "text typography");
}

export function buildTextRuns(layers: LayerOf<"text">[], ctx: BuildContext, runIndex: number): SceneText {
  const doc = buildAss(layers, ctx);
  const path = join(ctx.workDir, `${ctx.sceneId}-text-${runIndex}.ass`);
  return { ass: { path, content: doc.content, fontsDir: doc.fontsDir },
    filter: `ass=filename=${escapePath(path)}:fontsdir=${escapePath(doc.fontsDir)}`,
    fontFiles: doc.fontFiles };
}
