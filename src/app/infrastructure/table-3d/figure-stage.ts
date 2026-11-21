import type { TableWorldModel } from '@axe/domain/tabletop/world/table-models';
import { ModelLayer } from '@axe/infrastructure/table-3d/model-layer';
import { seePageFloor } from '@axe/infrastructure/table-3d/page-floor-camera';
import { ReadiedDrawing } from '@axe/infrastructure/table-3d/readied-drawing';
import { SkyMirror } from '@axe/infrastructure/table-3d/sky-mirror';
import type { FigureStage, FigureStageView, StageFigure } from '@axe/infrastructure/table-3d/table-3d-port';
import { createCanvasRenderer } from '@axe/infrastructure/three-kit/canvas-renderer';
import { letGoOfRenderer } from '@axe/infrastructure/three-kit/dispose';
import { cappedPixelRatio } from '@axe/infrastructure/three-kit/pixel-ratio';
import { materialEmissive } from 'three/tsl';
import {
  type Camera,
  DirectionalLight,
  HemisphereLight,
  MeshStandardNodeMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  type WebGPURenderer,
} from 'three/webgpu';

/** How strong a light is that lights a level face fully, as the scene's faces take light. */
const LIGHT_SCALE = Math.PI;
/** How much of the light on a level face comes from the sky all round, the rest straight from the lamp over the eye. */
const SKY_SHARE = 0.45;
/** How much dimmer than the sky the ground under the stage is, as its figures are lit from below and mirror it. */
const GROUND_BOUNCE = 0.6;
/** How far above level figures seen from the front are looked at from, in radians, so their feet and the tops of their heads show. */
const FRONT_TIP = (8 * Math.PI) / 180;
/** How far off the eye that sees figures from the front stands, and how far it sees, in the canvas's pixels. */
const FRONT_DISTANCE = 6000;
/** How far apart frames are drawn while the figures only stand in their motions, in milliseconds. */
const STANDING_FRAME_MS = 1000 / 30;

/**
 * A see-through canvas the models of pieces stand on apart from the table. The models are read,
 * drawn and moved by the same layer the table draws them with, so a figure looks and moves here as
 * its piece does there; they are lit by a sky all round and a lamp over the eye, and mirror that sky.
 */
class Stage implements FigureStage {
  private readonly scene = new Scene();
  private readonly floorEye = new PerspectiveCamera(30, 1, 1, 10000);
  private readonly frontEye = new OrthographicCamera(0, 1, 1, 0, 1, FRONT_DISTANCE * 2);
  private readonly mirror = new SkyMirror();
  private readonly models: ModelLayer;
  private drawing: ReadiedDrawing;
  private eye: Camera = this.frontEye;
  private width = 0;
  private height = 0;
  private arrived: () => void = () => undefined;
  private frame: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private gone = false;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly canvas: HTMLCanvasElement
  ) {
    const sky = new HemisphereLight(0xffffff, 0xffffff, LIGHT_SCALE * SKY_SHARE);
    sky.groundColor.setScalar(GROUND_BOUNCE);
    const lamp = new DirectionalLight(0xfff4e2, LIGHT_SCALE * (1 - SKY_SHARE));
    lamp.position.set(-0.45, 1, 0.9);
    this.scene.add(sky, lamp, lamp.target);
    this.mirror.set({ r: 1, g: 1, b: 1 }, 1, GROUND_BOUNCE);
    this.models = new ModelLayer(
      (material) => {
        if (!(material instanceof MeshStandardNodeMaterial)) return;
        material.emissiveNode =
          material.emissive.getHex() === 0 ? this.mirror.node : this.mirror.node.add(materialEmissive);
      },
      () => {
        this.arrived();
        this.run();
      },
      () => this.renderer
    );
    this.models.setTurning(true);
    this.scene.add(this.models.group);
    this.drawing = new ReadiedDrawing(renderer, this.scene, this.eye);
  }

  show(figures: readonly StageFigure[], view: FigureStageView): void {
    if (this.gone) return;
    this.see(view);
    const height = 'front' in view ? view.front.height : 0;
    this.models.set(figures.map((figure) => standing(figure, 'front' in view, height)));
    this.run();
  }

  stands(key: string): boolean {
    return this.models.draws(key);
  }

  onArrival(listener: () => void): void {
    this.arrived = listener;
  }

  setMoving(moving: boolean): void {
    this.models.setTurning(moving);
    this.run();
  }

  async picture(): Promise<Blob | null> {
    if (this.gone) return null;
    this.models.advance(performance.now());
    this.renderer.render(this.scene, this.eye);
    return new Promise((resolve) => this.canvas.toBlob(resolve, 'image/webp', 0.9));
  }

  /** Stops drawing and lets go of the models and of the renderer. */
  dispose(): void {
    this.gone = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    if (this.timer !== null) clearTimeout(this.timer);
    this.frame = null;
    this.timer = null;
    this.drawing.dispose();
    this.models.dispose();
    void letGoOfRenderer(this.renderer);
  }

  /** Fits the canvas to the box it is laid out in, and stands the eye that sees the stage as asked. */
  private see(view: FigureStageView): void {
    const box = 'front' in view ? view.front : view.floor;
    const width = Math.max(1, Math.round(box.width));
    const height = Math.max(1, Math.round(box.height));
    if (width !== this.width || height !== this.height) {
      this.renderer.setPixelRatio(cappedPixelRatio());
      this.renderer.setSize(width, height, false);
      this.width = width;
      this.height = height;
    }
    const eye = 'front' in view ? this.frontEye : this.floorEye;
    if ('front' in view) {
      this.frontEye.right = width;
      this.frontEye.top = height;
      this.frontEye.position.set(0, Math.sin(FRONT_TIP) * FRONT_DISTANCE, Math.cos(FRONT_TIP) * FRONT_DISTANCE);
      this.frontEye.rotation.set(-FRONT_TIP, 0, 0);
      this.frontEye.updateProjectionMatrix();
      this.frontEye.updateMatrixWorld();
    } else {
      seePageFloor(this.floorEye, view.floor);
    }
    if (eye === this.eye) return;
    this.eye = eye;
    this.drawing.dispose();
    this.drawing = new ReadiedDrawing(this.renderer, this.scene, eye);
  }

  /** Draws the stage now and goes on drawing it for as long as its figures move: every frame while one walks or acts, now and then while they only stand. */
  private run(): void {
    if (this.gone || this.frame !== null) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.frame = requestAnimationFrame((timeMs) => {
      this.frame = null;
      if (this.gone) return;
      const moving = this.models.advance(timeMs);
      if (this.models.takeChanged() || this.drawing.waiting) this.drawing.draw();
      if (moving === true || this.drawing.waiting) this.run();
      else if (moving === 'slowly') {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.run();
        }, STANDING_FRAME_MS);
      }
    });
  }
}

/**
 * A figure of the stage as the layer that draws the table's models stands one: on a floor, where it
 * is put; seen from the front, with its foot on the point of the canvas it is put at and as tall
 * there as it is asked to be, which the eye looking down a little would otherwise draw lower and
 * shorter.
 */
export function standing(figure: StageFigure, front: boolean, canvasHeight: number): TableWorldModel {
  const seen = front ? 1 / Math.cos(FRONT_TIP) : 1;
  const foot = front
    ? { x: figure.at.x, y: 0, z: (canvasHeight - figure.at.y) * seen }
    : { x: figure.at.x, y: figure.at.y, z: figure.at.z };
  return {
    owner: figure.key,
    kind: 'character',
    url: figure.url,
    model: figure.model,
    foot,
    footprintPx: Math.max(1, figure.widthPx),
    heightPx: figure.heightPx * seen,
    rotateDeg: figure.turnDeg,
    rollDeg: 0,
    pivotPx: 0,
    altitudePx: 0,
    walking: figure.walking === true,
    ...(figure.act ? { act: figure.act } : {}),
  };
}

/**
 * Makes a see-through canvas to stand the models of pieces on, or null where the browser cannot draw
 * one.
 */
export async function createFigureStage(canvas: HTMLCanvasElement): Promise<FigureStage | null> {
  try {
    return new Stage(await createCanvasRenderer(canvas, { alpha: true }), canvas);
  } catch {
    return null;
  }
}
