/** Stage-family text boxes for QA (030): compile each stage layer at scale 1 into its spec and find its settled text nodes. */
import { cacheDir } from "../../shared/index.ts";
import { settledTextBoxes } from "../../stage/settle.ts";
import type { ResolvedLayer, ResolvedTimeline } from "../../timeline/index.ts";
import { GraphBuilder } from "../graph.ts";
import type { BuildContext, StageRender } from "../ir.ts";
import { STAGE_FAMILY, compositeLayers, inputRegistry } from "../segment.ts";

export interface StageTextBox { absoluteFrame: number; x: number; y: number; width: number; height: number; color: string; size: number; sceneId: string }

function context(t: ResolvedTimeline, scene: ResolvedTimeline["scenes"][number], stages: Map<string, StageRender>): BuildContext {
  return { graph: new GraphBuilder(), inputs: inputRegistry(), width: t.width, height: t.height, scale: 1, fps: t.fps, rate: 1, frames: scene.frames,
    renderFrames: scene.frames, background: "#000000", oversample: 1, profile: "final", sceneId: scene.id, sources: t.sources, fonts: t.fonts,
    workDir: cacheDir("qa-fonts"), pngDir: cacheDir("png"), textBackend: "raster", stages, stageEvents: [], ...(t.beat ? { beat: t.beat } : {}) };
}

export function stageTextBoxes(t: ResolvedTimeline): StageTextBox[] {
  const out: StageTextBox[] = [];
  for (const scene of t.scenes) {
    const layers = scene.layers.filter((l: ResolvedLayer) => STAGE_FAMILY.has(l.type));
    for (const layer of layers) {
      const stages = new Map<string, StageRender>();
      const ctx = context(t, scene, stages);
      compositeLayers(ctx, "0:v", [layer]);
      for (const render of stages.values()) for (const box of settledTextBoxes(render.spec)) {
        out.push({ ...box, absoluteFrame: layer.absoluteStartFrame + box.frame, sceneId: scene.id });
      }
    }
  }
  return out;
}
