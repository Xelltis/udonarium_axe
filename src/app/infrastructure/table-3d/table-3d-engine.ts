import { TABLE_PERSPECTIVE_PX } from '@axe/domain/tabletop/physical-scale';
import type { TableWorld, TableWorldBoard } from '@axe/domain/tabletop/world/table-world';
import type { Table3dCamera, Table3dEngine, Table3dEngineOptions } from '@axe/infrastructure/table-3d/table-3d-port';
import { disposeObject } from '@axe/infrastructure/three-kit/dispose';
import { float, max, sRGBTransferEOTF, sRGBTransferOETF, texture, type vec3, vec4 } from 'three/tsl';
import {
  BufferGeometry,
  Camera,
  DoubleSide,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  WebGPURenderer,
} from 'three/webgpu';

/** How near and far the camera draws, in table pixels from the eye. */
const NEAR_PX = 1;
const FAR_PX = 50000;

/** How much white the board is veiled with while nothing is laid under it, as the page veils it. */
const BOARD_VEIL = 0.15;

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
  private lost = false;
  private loading = 0;
  private needsFrame: () => void = () => undefined;
  private readonly pictures = new TextureLoader();

  constructor(
    private readonly renderer: WebGPURenderer,
    readonly backend: 'webgpu' | 'webgl2'
  ) {
    for (const camera of [this.perspective, this.orthographic]) camera.matrixAutoUpdate = false;
  }

  onNeedsFrame(listener: () => void): void {
    this.needsFrame = listener;
  }

  isLoading(): boolean {
    return this.loading > 0;
  }

  onLost(listener: () => void): void {
    this.renderer.onDeviceLost = () => {
      this.lost = true;
      listener();
    };
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
    if (!this.changed || this.lost) return false;
    this.changed = false;
    this.renderer.render(this.scene, this.camera);
    return true;
  }

  dispose(): void {
    disposeObject(this.scene);
    try {
      this.renderer.dispose();
    } catch {
      // A renderer whose card let it go has nothing left to give back.
    }
  }

  /**
   * Lays the board flat at the floor with its picture stretched over its box, cut to its cells on a
   * hex board, and builds it again only when any of that changes.
   */
  private placeBoard(board: TableWorldBoard | null): void {
    const shape = board
      ? JSON.stringify([
          board.shape.box,
          board.shape.hexes?.length ?? 0,
          board.gridSize,
          board.gridType,
          board.pictureUrl,
          board.veiled,
        ])
      : '';
    if (shape === this.boardShape) return;
    this.boardShape = shape;
    if (this.board) {
      this.scene.remove(this.board);
      disposeObject(this.board);
      this.board = null;
    }
    if (!board) return;
    const material = new MeshBasicNodeMaterial({ transparent: true, side: DoubleSide });
    material.colorNode = boardColour(board.pictureUrl ? this.picture(board.pictureUrl) : null, board.veiled);
    this.board = new Mesh(boardGeometry(board), material);
    this.scene.add(this.board);
  }

  /** A picture to draw, which asks for a frame once it has come. */
  private picture(url: string): Texture {
    this.loading++;
    const settle = () => {
      this.loading--;
      this.changed = true;
      this.needsFrame();
    };
    const picture = this.pictures.load(url, settle, undefined, settle);
    picture.colorSpace = SRGBColorSpace;
    return picture;
  }
}

/** A colour the library's colour-space functions answer, which they do not say is a colour. */
function colourNode(node: unknown): ReturnType<typeof vec3> {
  return node as ReturnType<typeof vec3>;
}

/**
 * The board's picture as the page draws it, in sRGB: over a little white where nothing is laid
 * under the board, which shows through where the picture is clear, and over what lies behind.
 */
function boardColour(picture: Texture | null, veiled: boolean) {
  const veil = float(veiled ? BOARD_VEIL : 0);
  const sampled = picture ? texture(picture) : vec4(0, 0, 0, 0);
  const clear = float(1).sub(sampled.a);
  const alpha = float(1).sub(float(1).sub(veil).mul(clear));
  const shown = colourNode(sRGBTransferOETF(sampled.rgb))
    .mul(sampled.a)
    .add(veil.mul(clear))
    .div(max(alpha, float(0.0001)));
  return vec4(colourNode(sRGBTransferEOTF(shown)), alpha);
}

/**
 * The board's face, lying on the floor: its whole box on a square board, and each of its cells on a
 * hex board, with the picture's box read off across it.
 */
function boardGeometry(board: TableWorldBoard): BufferGeometry {
  const { box, hexes } = board.shape;
  if (!hexes) {
    const plane = new PlaneGeometry(box.width, box.height);
    plane.rotateX(-Math.PI / 2);
    plane.translate(box.x + box.width / 2, 0, box.y + box.height / 2);
    return plane;
  }
  const positions: number[] = [];
  const uvs: number[] = [];
  const corner = (point: { x: number; y: number }) => {
    positions.push(point.x, 0, point.y);
    uvs.push((point.x - box.x) / box.width, 1 - (point.y - box.y) / box.height);
  };
  for (const hex of hexes) {
    for (let i = 1; i < hex.length - 1; i++) {
      corner(hex[0]);
      corner(hex[i]);
      corner(hex[i + 1]);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return geometry;
}
