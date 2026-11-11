import { MAX_EFFECT_LIGHTS } from '@axe/domain/effect/effect-light';
import type { EffectFrame } from '@axe/domain/effect/scene/effect-scene';
import { EffectLayer } from '@axe/infrastructure/table-3d/effect-layer';
import type {
  EffectOverlay,
  EffectOverlayView,
  EffectStage,
  EffectStageOptions,
} from '@axe/infrastructure/table-3d/table-3d-port';
import { letGoOfRenderer } from '@axe/infrastructure/three-kit/dispose';
import { abs, float, fract, max, min, mix, smoothstep, uv, vec2, vec3 } from 'three/tsl';
import {
  Color,
  CylinderGeometry,
  HemisphereLight,
  Mesh,
  MeshLambertNodeMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  Scene,
  Vector3,
  WebGPURenderer,
} from 'three/webgpu';

/** How far above level the board is looked at from, and how far round, in degrees, as the table is by default. */
const LOOK_DOWN_DEG = 40;
const LOOK_ROUND_DEG = 10;
/** How wide the camera sees, in degrees. */
const FIELD_OF_VIEW = 30;
/** How strong the light of an effect is made against the scene's own light. */
const LIGHT_SCALE = 2.2;
const BOARD = new Color(0x2a2f38);
const LINE = new Color(0x4a5260);
const FIGURE = new Color(0x9fb0c4);
const ACROSS = new Vector3(1, 0, 0);

/**
 * A small stage an effect is played on, apart from the table: a board with its grid, a stand-in piece
 * at its middle and another where an aimed effect is fired from, lit softly, and the effect drawn
 * among them by the same layer the table draws it with, so a preview looks as the table will.
 */
class SmallStage implements EffectStage {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 1, 10000);
  private readonly effects = new EffectLayer();
  private readonly lamps = Array.from({ length: MAX_EFFECT_LIGHTS }, () => new PointLight(0xffffff, 0, 1, 1));
  private readonly owned: { dispose(): void }[] = [];
  private zoomOut: number;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly canvas: HTMLCanvasElement,
    private readonly options: EffectStageOptions
  ) {
    const { cellPx, across, down } = options;
    this.zoomOut = options.zoomOut ?? 1;
    this.scene.add(new HemisphereLight(0xdfe8ff, 0x20242c, 1.6));
    for (const lamp of this.lamps) this.scene.add(lamp);
    this.scene.add(this.board(cellPx, across, down));
    for (const figure of options.figures) this.scene.add(...this.standIn(figure.x, figure.y, cellPx, figure.dim));
    this.scene.add(this.effects.group);
    this.resize();
  }

  /** The board, its grid drawn a cell at a time over it. */
  private board(cellPx: number, across: number, down: number): Mesh {
    const geometry = new PlaneGeometry(across * cellPx, down * cellPx);
    geometry.rotateX(-Math.PI / 2);
    const material = new MeshLambertNodeMaterial();
    const cells = uv().mul(vec2(across, down));
    // How far a point is from the nearest line of the grid, in cells.
    const near = min(float(0.5).sub(abs(fract(cells.x).sub(0.5))), float(0.5).sub(abs(fract(cells.y).sub(0.5))));
    const line = float(1).sub(smoothstep(0, 0.035, near));
    const edge = smoothstep(0.42, 0.5, max(abs(uv().x.sub(0.5)), abs(uv().y.sub(0.5))));
    material.colorNode = mix(
      mix(vec3(BOARD.r, BOARD.g, BOARD.b), vec3(LINE.r, LINE.g, LINE.b), line),
      vec3(0.05, 0.06, 0.08),
      edge
    );
    this.owned.push(geometry, material);
    return new Mesh(geometry, material);
  }

  /** A stand-in piece: a column about as tall as a piece, on a ring on the floor. */
  private standIn(x: number, y: number, cellPx: number, dim: boolean): Mesh[] {
    const tall = cellPx * 0.9;
    const column = new CylinderGeometry(cellPx * 0.22, cellPx * 0.3, tall, 24);
    column.translate(x, tall / 2, y);
    const body = new MeshLambertNodeMaterial({ color: FIGURE, transparent: dim, opacity: dim ? 0.45 : 1 });
    const ring = new RingGeometry(cellPx * 0.36, cellPx * 0.45, 32);
    ring.rotateX(-Math.PI / 2);
    ring.translate(x, 0.5, y);
    const foot = new MeshLambertNodeMaterial({ color: FIGURE, transparent: true, opacity: dim ? 0.25 : 0.55 });
    this.owned.push(column, body, ring, foot);
    return [new Mesh(column, body), new Mesh(ring, foot)];
  }

  show(frame: EffectFrame): void {
    this.effects.set(frame);
    this.lamps.forEach((lamp, index) => {
      const light = frame.lights[index];
      lamp.intensity = light ? light.strength * LIGHT_SCALE * 10000 : 0;
      if (!light) return;
      lamp.position.set(light.x, light.z, light.y);
      lamp.color.set(light.color);
      lamp.distance = light.reachPx * 1.5;
    });
    this.renderer.render(this.scene, this.camera);
  }

  zoom(out: number): void {
    if (out === this.zoomOut) return;
    this.zoomOut = out;
    this.resize();
  }

  resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Far enough off for the board to fill the width, a little over the stand-in's middle.
    const { cellPx, across } = this.options;
    const across2 = (across * cellPx * 0.5) / Math.tan(((FIELD_OF_VIEW / 2) * Math.PI) / 180) / this.camera.aspect;
    const distance = across2 * 0.85 * this.zoomOut;
    const down = (LOOK_DOWN_DEG * Math.PI) / 180;
    const round = (LOOK_ROUND_DEG * Math.PI) / 180;
    const level = Math.cos(down) * distance;
    this.camera.position.set(Math.sin(round) * level, Math.sin(down) * distance, Math.cos(round) * level);
    this.camera.lookAt(0, cellPx * 0.45, 0);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.effects.dispose();
    for (const thing of this.owned) thing.dispose();
    void letGoOfRenderer(this.renderer);
  }
}

/**
 * A see-through canvas over a floor the page draws in 3D, effects drawn on it by the same layer the
 * table draws them with, seen as the page sees that floor: the eye where the box's perspective puts
 * it, the floor tipped and grown about its origin. Light adds to the page under it; nothing else of
 * the canvas covers it.
 */
class OverPage implements EffectOverlay {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 1, 10000);
  private readonly effects = new EffectLayer(true);
  private width = 0;
  private height = 0;

  constructor(private readonly renderer: WebGPURenderer) {
    this.scene.add(this.effects.group);
  }

  show(frame: EffectFrame, view: EffectOverlayView): void {
    this.fit(view);
    this.effects.set(frame);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Stands the camera in the floor's own measure: where the page's eye is, a perspective's length in
   * front of the middle of the box, brought into the floor by undoing its growing and its tipping.
   */
  private fit(view: EffectOverlayView): void {
    const width = Math.max(1, view.width);
    const height = Math.max(1, view.height);
    if (width !== this.width || height !== this.height) {
      this.renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
      this.renderer.setSize(width, height, false);
      this.width = width;
      this.height = height;
    }
    const scale = Math.max(view.scale, 0.01);
    const tipped = ((90 - view.tiltDeg) * Math.PI) / 180;
    this.camera.quaternion.setFromAxisAngle(ACROSS, -tipped);
    this.camera.position
      .set(width / 2 - view.originX, view.originY - height / 2, view.perspectivePx)
      .divideScalar(scale)
      .applyQuaternion(this.camera.quaternion);
    this.camera.fov = (2 * Math.atan(height / 2 / view.perspectivePx) * 180) / Math.PI;
    this.camera.aspect = width / height;
    this.camera.near = (view.perspectivePx * 0.02) / scale;
    this.camera.far = (view.perspectivePx * 20) / scale;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  dispose(): void {
    this.effects.dispose();
    void letGoOfRenderer(this.renderer);
  }
}

/** Makes a see-through canvas to draw effects over a floor the page draws, or null where the browser cannot draw one. */
export async function createEffectOverlay(canvas: HTMLCanvasElement): Promise<EffectOverlay | null> {
  try {
    const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true });
    await renderer.init();
    renderer.setClearColor(0x000000, 0);
    return new OverPage(renderer);
  } catch {
    return null;
  }
}

/** Makes a small stage on a canvas to play an effect on, or null where the browser cannot draw one. */
export async function createEffectStage(
  canvas: HTMLCanvasElement,
  options: EffectStageOptions
): Promise<EffectStage | null> {
  try {
    const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false });
    await renderer.init();
    renderer.setClearColor(0x0b0d11, 1);
    return new SmallStage(renderer, canvas, options);
  } catch {
    return null;
  }
}
