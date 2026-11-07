import type { ModelPainter, ModelStage } from '@axe/infrastructure/model-viewer/model-viewer-port';
import { disposeObject } from '@axe/infrastructure/three-kit/dispose';
import { HeldModelReader } from '@axe/infrastructure/three-kit/held-model-reader';
import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  type Object3D,
  PerspectiveCamera,
  Scene,
  Sphere,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';

/** How far above level the model is looked at from, in radians, before it is tipped by hand. */
const LOOK_DOWN = (25 * Math.PI) / 180;
/** How far the view may be tipped, up or down, in radians. */
const MOST_TIP = (80 * Math.PI) / 180;
/** How fast the model turns on its own, in radians a second. */
const TURN_SPEED = 0.6;
/** How far a pixel of a drag turns the model, in radians. */
const DRAG_TURN = 0.01;
/** How wide the camera sees, in degrees. */
const FIELD_OF_VIEW = 35;

/** A scene lit for one model, and the camera that looks at it. */
class Showcase {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.01, 1000);
  private model: Object3D | null = null;
  private readonly middle = new Vector3();
  private radius = 1;
  turn = 0;
  tip = LOOK_DOWN;

  constructor() {
    this.scene.add(new HemisphereLight(0xffffff, 0x50505a, 1.6));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(3, 6, 4);
    this.scene.add(sun);
  }

  /** Puts a model in the scene in place of the one before, and frames it. */
  hold(model: Object3D): void {
    this.letGo();
    this.model = model;
    this.scene.add(model);
    model.updateMatrixWorld(true);
    const sphere = new Box3().setFromObject(model).getBoundingSphere(new Sphere());
    this.middle.copy(sphere.center);
    this.radius = sphere.radius > 0 ? sphere.radius : 1;
    this.place();
  }

  /** Stands the camera where the turn and the tip have it, far enough off to see the whole model. */
  place(): void {
    const distance = this.radius / Math.sin(((FIELD_OF_VIEW / 2) * Math.PI) / 180);
    const level = Math.cos(this.tip) * distance;
    this.camera.position.set(
      this.middle.x + Math.sin(this.turn) * level,
      this.middle.y + Math.sin(this.tip) * distance,
      this.middle.z + Math.cos(this.turn) * level
    );
    this.camera.near = Math.max(0.001, distance - this.radius * 2);
    this.camera.far = distance + this.radius * 2;
    this.camera.lookAt(this.middle);
    this.camera.updateProjectionMatrix();
  }

  letGo(): void {
    if (!this.model) return;
    this.scene.remove(this.model);
    disposeObject(this.model);
    this.model = null;
  }
}

/** A renderer on a canvas, or null where the browser cannot make one. */
function rendererOn(canvas: HTMLCanvasElement, keepsDrawing: boolean): WebGLRenderer | null {
  try {
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: keepsDrawing });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    return renderer;
  } catch {
    return null;
  }
}

class Stage implements ModelStage {
  private readonly showcase = new Showcase();
  private readonly reader: HeldModelReader;
  private turning = true;
  private frame: number | null = null;
  private lastMs: number | null = null;
  private shown = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: WebGLRenderer
  ) {
    this.reader = new HeldModelReader(() => this.renderer);
    this.resize();
  }

  async show(url: string): Promise<boolean> {
    const asked = ++this.shown;
    const gltf = await this.reader.read(url).catch(() => null);
    if (asked !== this.shown) {
      if (gltf) disposeObject(gltf.scene);
      return false;
    }
    if (!gltf) {
      this.showcase.letGo();
      this.draw();
      return false;
    }
    this.showcase.hold(gltf.scene);
    this.draw();
    this.loop();
    return true;
  }

  turnBy(acrossPx: number, downPx: number): void {
    this.showcase.turn -= acrossPx * DRAG_TURN;
    this.showcase.tip = Math.max(-MOST_TIP, Math.min(MOST_TIP, this.showcase.tip + downPx * DRAG_TURN));
    this.showcase.place();
    this.draw();
  }

  setTurning(on: boolean): void {
    this.turning = on;
    if (on) this.loop();
  }

  resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.renderer.setSize(width, height, false);
    this.showcase.camera.aspect = width / height;
    this.showcase.camera.updateProjectionMatrix();
    this.draw();
  }

  dispose(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.showcase.letGo();
    this.reader.dispose();
    this.renderer.dispose();
  }

  private loop(): void {
    if (this.frame !== null || !this.turning) return;
    this.lastMs = null;
    const step = (nowMs: number) => {
      this.frame = null;
      if (!this.turning) return;
      const sinceMs = this.lastMs === null ? 0 : nowMs - this.lastMs;
      this.lastMs = nowMs;
      this.showcase.turn += (TURN_SPEED * sinceMs) / 1000;
      this.showcase.place();
      this.draw();
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  private draw(): void {
    this.renderer.render(this.showcase.scene, this.showcase.camera);
  }
}

class Painter implements ModelPainter {
  private readonly reader: HeldModelReader;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: WebGLRenderer
  ) {
    this.reader = new HeldModelReader(() => this.renderer);
  }

  paint(url: string, sizePx: number): Promise<Blob | null> {
    const painted = this.queue.then(() => this.paintNow(url, sizePx));
    this.queue = painted.catch(() => null);
    return painted.catch(() => null);
  }

  dispose(): void {
    this.reader.dispose();
    this.renderer.dispose();
  }

  private async paintNow(url: string, sizePx: number): Promise<Blob | null> {
    const gltf = await this.reader.read(url);
    if (!gltf) return null;
    const showcase = new Showcase();
    showcase.turn = Math.PI / 6;
    showcase.hold(gltf.scene);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(sizePx, sizePx, false);
    showcase.camera.aspect = 1;
    showcase.camera.updateProjectionMatrix();
    this.renderer.render(showcase.scene, showcase.camera);
    const picture = await new Promise<Blob | null>((resolve) => this.canvas.toBlob(resolve, 'image/webp', 0.9));
    showcase.letGo();
    return picture;
  }
}

/** A stage for one model on a canvas, or null where the browser cannot draw there. */
export function createModelStage(canvas: HTMLCanvasElement): ModelStage | null {
  const renderer = rendererOn(canvas, false);
  return renderer ? new Stage(canvas, renderer) : null;
}

/** A painter of pictures of models, or null where the browser cannot draw them. */
export function createModelPainter(): ModelPainter | null {
  const canvas = document.createElement('canvas');
  const renderer = rendererOn(canvas, true);
  return renderer ? new Painter(canvas, renderer) : null;
}
