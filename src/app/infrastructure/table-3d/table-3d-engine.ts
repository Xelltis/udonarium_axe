import { TABLE_PERSPECTIVE_PX } from '@axe/domain/tabletop/physical-scale';
import type { TableWorld, TableWorldBoard } from '@axe/domain/tabletop/world/table-world';
import type { Table3dCamera, Table3dEngine, Table3dEngineOptions } from '@axe/infrastructure/table-3d/table-3d-port';
import { disposeObject } from '@axe/infrastructure/three-kit/dispose';
import {
  Camera,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGPURenderer,
} from 'three/webgpu';

/** How near and far the camera draws, in table pixels from the eye. */
const NEAR_PX = 1;
const FAR_PX = 50000;

/** The colour the bare board is drawn in until it has a picture of its own. */
const BOARD_COLOUR = 0x8c8f87;

/**
 * The board's axes as the scene's: the board runs x to the east, y to the south and z up, and the
 * scene x to the east, y up and z to the south, which is the board's space seen in a mirror and so
 * the right-handed space a graphics library works in.
 */
const BOARD_TO_SCENE = new Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

/** The eye's space as the camera's: the eye stands out along z, and the camera's y runs up the page. */
const EYE_TO_CAMERA = new Matrix4()
  .makeScale(1, -1, 1)
  .multiply(new Matrix4().makeTranslation(0, 0, -TABLE_PERSPECTIVE_PX));

/** Makes the engine that draws the table on a canvas, through WebGPU where it can and WebGL2 elsewhere. */
export async function createTable3dEngine(
  canvas: HTMLCanvasElement,
  options: Table3dEngineOptions
): Promise<Table3dEngine> {
  const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: true, forceWebGL: options.forceWebGL });
  await renderer.init();
  renderer.setClearColor(0x000000, 0);
  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
  return new ThreeTableEngine(renderer, backend);
}

class ThreeTableEngine implements Table3dEngine {
  private readonly scene = new Scene();
  private readonly perspective = new PerspectiveCamera(50, 1, NEAR_PX, FAR_PX);
  private readonly orthographic = new OrthographicCamera(-1, 1, 1, -1, NEAR_PX, FAR_PX);
  private camera: Camera = this.perspective;
  private board: Mesh | null = null;
  private boardShape = '';
  private changed = true;

  constructor(
    private readonly renderer: WebGPURenderer,
    readonly backend: 'webgpu' | 'webgl2'
  ) {
    for (const camera of [this.perspective, this.orthographic]) camera.matrixAutoUpdate = false;
  }

  setWorld(world: TableWorld): void {
    this.placeBoard(world.board);
    this.changed = true;
  }

  setCamera(view: Table3dCamera): void {
    const eye = new Matrix4().fromArray(view.eye as number[]);
    const toCamera = EYE_TO_CAMERA.clone().multiply(eye).multiply(BOARD_TO_SCENE);
    if (view.orthographic) {
      Object.assign(this.orthographic, {
        left: -view.width / 2,
        right: view.width / 2,
        top: view.height / 2,
        bottom: -view.height / 2,
      });
      this.orthographic.updateProjectionMatrix();
      this.camera = this.orthographic;
    } else {
      this.perspective.fov = (2 * Math.atan(view.height / 2 / TABLE_PERSPECTIVE_PX) * 180) / Math.PI;
      this.perspective.aspect = view.width / Math.max(1, view.height);
      this.perspective.updateProjectionMatrix();
      this.camera = this.perspective;
    }
    this.camera.matrix.copy(toCamera).invert();
    this.camera.updateMatrixWorld(true);
    this.changed = true;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.changed = true;
  }

  renderIfChanged(): boolean {
    if (!this.changed) return false;
    this.changed = false;
    this.renderer.render(this.scene, this.camera);
    return true;
  }

  dispose(): void {
    disposeObject(this.scene);
    this.renderer.dispose();
  }

  /** Lays the board flat at the floor, as wide and deep as it runs, and builds it again only when that changes. */
  private placeBoard(board: TableWorldBoard | null): void {
    const shape = board ? `${board.widthPx}x${board.depthPx}` : '';
    if (shape === this.boardShape) return;
    this.boardShape = shape;
    if (this.board) {
      this.scene.remove(this.board);
      disposeObject(this.board);
      this.board = null;
    }
    if (!board) return;
    const geometry = new PlaneGeometry(board.widthPx, board.depthPx);
    geometry.rotateX(-Math.PI / 2);
    this.board = new Mesh(geometry, new MeshBasicNodeMaterial({ color: BOARD_COLOUR }));
    this.board.position.set(board.widthPx / 2, 0, board.depthPx / 2);
    this.scene.add(this.board);
  }
}
