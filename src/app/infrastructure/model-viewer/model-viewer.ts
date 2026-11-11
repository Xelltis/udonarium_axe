import type { ModelPainter, ModelStage } from '@axe/infrastructure/model-viewer/model-viewer-port';
import { disposeObject } from '@axe/infrastructure/three-kit/dispose';
import { HeldModelReader } from '@axe/infrastructure/three-kit/held-model-reader';
import { meshesOf, triangleCentresOf } from '@axe/infrastructure/three-kit/model-faces';
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  SRGBColorSpace,
  Vector2,
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
  model: Object3D | null = null;
  private readonly middle = new Vector3();
  radius = 1;
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
  /** The shapes the painted faces are shown with, over the model. */
  private painted: Mesh[] = [];
  /** The middles of the model's triangles in the scene, by mesh, worked out once the model is shown. */
  private centres: Float32Array[] | null = null;
  private readonly reader: HeldModelReader;
  private turning = true;
  private frame: number | null = null;
  private lastMs: number | null = null;
  private shown = 0;
  private disposed = false;

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
    if (asked !== this.shown || this.disposed) {
      if (gltf) disposeObject(gltf.scene);
      return false;
    }
    if (!gltf) {
      this.showcase.letGo();
      this.draw();
      return false;
    }
    this.showcase.hold(gltf.scene);
    this.centres = null;
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

  facesNear(canvasX: number, canvasY: number, widthShare: number): ReadonlyMap<number, readonly number[]> {
    const model = this.showcase.model;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!model || !(width > 0) || !(height > 0)) return new Map();
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2((canvasX / width) * 2 - 1, -(canvasY / height) * 2 + 1), this.showcase.camera);
    const hit = ray.intersectObject(model, true)[0];
    if (!hit) return new Map();
    const reach = (widthShare * this.showcase.radius) ** 2;
    const found = new Map<number, number[]>();
    this.centroids().forEach((centres, mesh) => {
      const near: number[] = [];
      for (let triangle = 0; triangle * 3 < centres.length; triangle++) {
        const dx = centres[triangle * 3] - hit.point.x;
        const dy = centres[triangle * 3 + 1] - hit.point.y;
        const dz = centres[triangle * 3 + 2] - hit.point.z;
        if (dx * dx + dy * dy + dz * dz <= reach) near.push(triangle);
      }
      if (near.length > 0) found.set(mesh, near);
    });
    return found;
  }

  showFaces(
    chosen: ReadonlyMap<number, ReadonlySet<number>>,
    others: readonly ReadonlyMap<number, ReadonlySet<number>>[]
  ): void {
    for (const shown of this.painted) {
      this.showcase.scene.remove(shown);
      shown.geometry.dispose();
      (shown.material as MeshBasicMaterial).dispose();
    }
    this.painted = [];
    const meshes = this.showcase.model ? meshesOf(this.showcase.model) : [];
    const lay = (faces: ReadonlyMap<number, ReadonlySet<number>>, colour: number, opacity: number) => {
      const points: number[] = [];
      const corner = new Vector3();
      faces.forEach((triangles, index) => {
        const mesh = meshes[index];
        if (!mesh) return;
        const position = mesh.geometry.getAttribute('position');
        const indices = mesh.geometry.getIndex();
        for (const triangle of triangles) {
          for (let at = 0; at < 3; at++) {
            const point = indices ? indices.getX(triangle * 3 + at) : triangle * 3 + at;
            if (point >= position.count) continue;
            // Posed as it is drawn and picked, by its bones and its morphs, rather than as it was bound.
            mesh.getVertexPosition(point, corner).applyMatrix4(mesh.matrixWorld);
            points.push(corner.x, corner.y, corner.z);
          }
        }
      });
      if (points.length < 9) return;
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(points), 3));
      const shown = new Mesh(
        geometry,
        new MeshBasicMaterial({
          color: colour,
          transparent: true,
          opacity,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -4,
          side: 2,
        })
      );
      this.painted.push(shown);
      this.showcase.scene.add(shown);
    };
    for (const one of others) lay(one, 0x4aa0ff, 0.3);
    lay(chosen, 0xffd400, 0.7);
    this.draw();
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

  /**
   * Lets go of the model and of the canvas's drawing, the browser's hold on it as well, so that stages
   * opened and closed one after another do not use up the drawings a page may hold. A model still
   * coming is let go of as it comes.
   */
  dispose(): void {
    this.disposed = true;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.showcase.letGo();
    this.reader.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  /** The middle of each triangle of each mesh of the model, in the scene, three numbers a triangle. */
  private centroids(): Float32Array[] {
    if (this.centres) return this.centres;
    const model = this.showcase.model;
    if (!model) return [];
    model.updateMatrixWorld(true);
    const corner = new Vector3();
    this.centres = meshesOf(model).map((mesh) => triangleCentresOf(mesh, corner));
    return this.centres;
  }

  private loop(): void {
    if (this.frame !== null || !this.turning || this.disposed) return;
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
    if (!this.disposed) this.renderer.render(this.showcase.scene, this.showcase.camera);
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
    this.renderer.forceContextLoss();
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
