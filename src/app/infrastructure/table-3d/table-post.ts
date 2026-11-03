import type { Table3dQualityPlan } from '@axe/infrastructure/table-3d/table-3d-quality';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { directionToColor, mrt, normalView, output, pass, vec4 } from 'three/tsl';
import { type Camera, type Node, RenderPipeline, type Scene, type WebGPURenderer } from 'three/webgpu';

/** How strongly the light of what glows spills round it, how far, and from how bright on. */
const BLOOM_STRENGTH = 0.7;
const BLOOM_RADIUS = 0.35;
const BLOOM_THRESHOLD = 0;
/** How many samples each pixel of the scene is drawn with, smoothing the edges as the canvas itself does. */
const SAMPLES = 4;
/** How large the shading of corners and creases is worked out, beside the screen. */
const AO_SCALE = 0.5;

/**
 * Draws the scene through the finishing the quality the table is drawn at asks for: the light of what
 * glows spilling round it, and at high quality the corners and creases shaded. What glows is the glow
 * given, written on an output of its own for every point of the scene, so a white card is never haloed
 * for being white. A quality that asks for neither draws the scene straight onto the canvas.
 */
export class TablePost {
  private pipeline: RenderPipeline | null = null;
  private laidKey = '';

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly glow: Node<'vec3'>
  ) {}

  render(scene: Scene, camera: Camera, plan: Table3dQualityPlan): void {
    const key = plan.bloom || plan.ambientOcclusion ? `${camera.uuid}|${plan.bloom}|${plan.ambientOcclusion}` : '';
    if (key !== this.laidKey) {
      this.laidKey = key;
      this.pipeline?.dispose();
      this.pipeline = key ? this.build(scene, camera, plan) : null;
    }
    if (this.pipeline) this.pipeline.render();
    else this.renderer.render(scene, camera);
  }

  dispose(): void {
    this.pipeline?.dispose();
    this.pipeline = null;
  }

  private build(scene: Scene, camera: Camera, plan: Table3dQualityPlan): RenderPipeline {
    const scenePass = pass(scene, camera, { samples: SAMPLES });
    scenePass.setMRT(
      mrt({
        output,
        glow: vec4(this.glow, output.a),
        ...(plan.ambientOcclusion ? { normal: directionToColor(normalView) } : {}),
      })
    );
    let colour = scenePass.getTextureNode('output');
    if (plan.ambientOcclusion) {
      const shading = ao(scenePass.getTextureNode('depth'), scenePass.getTextureNode('normal'), camera);
      shading.resolutionScale = AO_SCALE;
      colour = vec4(colour.rgb.mul(shading.getTextureNode().r), colour.a) as unknown as typeof colour;
    }
    if (plan.bloom) {
      const glow = bloom(scenePass.getTextureNode('glow'), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
      colour = vec4(colour.rgb.add(glow.rgb), colour.a) as unknown as typeof colour;
    }
    const pipeline = new RenderPipeline(this.renderer);
    pipeline.outputNode = colour;
    return pipeline;
  }
}
