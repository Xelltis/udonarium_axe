import type { Table3dQualityPlan } from '@axe/infrastructure/table-3d/table-3d-quality';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { mrt, normalView, output, packNormalToRGB, pass, vec4 } from 'three/tsl';
import {
  type Camera,
  type Node,
  type Object3D,
  type PassNode,
  RenderPipeline,
  type Scene,
  Vector2,
  type WebGPURenderer,
} from 'three/webgpu';

/** How strongly the light of what glows spills round it, how far, and from how bright on. */
const BLOOM_STRENGTH = 0.7;
const BLOOM_RADIUS = 0.35;
const BLOOM_THRESHOLD = 0;
/** How many samples each pixel of the scene is drawn with, smoothing the edges as the canvas itself does. */
const SAMPLES = 4;
/** How large the shading of corners and creases is worked out, beside the screen. */
const AO_SCALE = 0.5;
/** How many new things are readied one by one; more than that, and the whole scene is readied at once. */
const READIED_ONE_BY_ONE = 24;

const drawingSize = new Vector2();

/** The count of the frames it draws a renderer keeps to itself, which it may not have yet. */
interface FrameCount {
  readonly _nodes?: { readonly nodeFrame?: { update(): void } } | null;
}

/**
 * Has the renderer take what is drawn next for a frame of its own. The renderer draws the scene's pass
 * of the finishing, and the glow spilled from it, once in a frame, and counts its frames by the page's
 * own; a canvas drawn at once, as for a page whose clock is held, may be drawn more than once before
 * the page's next frame, and a scene drawn again in the same frame would show through the finishing
 * as it was drawn before.
 */
function beginFrame(renderer: WebGPURenderer): void {
  (renderer as unknown as FrameCount)._nodes?.nodeFrame?.update();
}

/**
 * Draws the scene through the finishing the quality the table is drawn at asks for: the light of what
 * glows spilling round it, and at high quality the corners and creases shaded. What glows is the glow
 * given, written on an output of its own for every point of the scene, so a white card is never haloed
 * for being white. A quality that asks for neither draws the scene straight onto the canvas.
 */
export class TablePost {
  private pipeline: RenderPipeline | null = null;
  /** The pass the scene is drawn in through the finishing, while there is any. */
  private scenePass: PassNode | null = null;
  private laidKey = '';

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly glow: Node<'vec3'>
  ) {}

  render(scene: Scene, camera: Camera, plan: Table3dQualityPlan): void {
    this.lay(scene, camera, plan);
    beginFrame(this.renderer);
    if (this.pipeline) this.pipeline.render();
    else this.renderer.render(scene, camera);
  }

  /**
   * Readies the graphics card to draw things new to the scene through the finishing, drawing nothing,
   * so the frame that first draws them does not stop to build what drawing them asks for. A few are
   * readied one by one, as the dice of a roll, rather than the whole scene with them: readying gives
   * way to the frames being drawn, and on a slow machine a whole scene takes many of them.
   */
  async compileAsync(
    scene: Scene,
    camera: Camera,
    plan: Table3dQualityPlan,
    things: readonly Object3D[]
  ): Promise<void> {
    this.lay(scene, camera, plan);
    const renderer = this.renderer;
    const pass = this.scenePass;
    if (things.length > READIED_ONE_BY_ONE) {
      await (pass ? pass.compileAsync(renderer) : renderer.compileAsync(scene, camera));
      return;
    }
    const target = renderer.getRenderTarget();
    const mrt = renderer.getMRT();
    if (pass) {
      pass.renderTarget.samples = SAMPLES;
      renderer.getDrawingBufferSize(drawingSize);
      pass.setSize(drawingSize.width, drawingSize.height);
      renderer.setRenderTarget(pass.renderTarget);
      renderer.setMRT(pass.getMRT());
    }
    try {
      for (const thing of things) await renderer.compileAsync(thing, camera, scene);
    } finally {
      renderer.setRenderTarget(target);
      renderer.setMRT(mrt);
    }
  }

  dispose(): void {
    this.pipeline?.dispose();
    this.pipeline = null;
    this.scenePass = null;
  }

  /** Builds the finishing again where the camera or the quality asks for another. */
  private lay(scene: Scene, camera: Camera, plan: Table3dQualityPlan): void {
    const key = plan.bloom || plan.ambientOcclusion ? `${camera.uuid}|${plan.bloom}|${plan.ambientOcclusion}` : '';
    if (key === this.laidKey) return;
    this.laidKey = key;
    this.pipeline?.dispose();
    this.scenePass = null;
    this.pipeline = key ? this.build(scene, camera, plan) : null;
  }

  private build(scene: Scene, camera: Camera, plan: Table3dQualityPlan): RenderPipeline {
    const scenePass = pass(scene, camera, { samples: SAMPLES });
    this.scenePass = scenePass;
    scenePass.setMRT(
      mrt({
        output,
        glow: vec4(this.glow, output.a),
        ...(plan.ambientOcclusion ? { normal: packNormalToRGB(normalView) } : {}),
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
