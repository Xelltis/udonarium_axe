import { TABLE_PERSPECTIVE_PX } from '@axe/domain/tabletop/physical-scale';
import type {
  TableWorld,
  TableWorldBoard,
  TableWorldCap,
  TableWorldWall,
} from '@axe/domain/tabletop/world/table-world';
import { changedChunks, chunkSignatures, facesByOwner, OwnedFaces } from '@axe/infrastructure/table-3d/face-chunks';
import {
  boardGeometry,
  capGeometry,
  griddedTops,
  mergedFaces,
  wallGeometry,
} from '@axe/infrastructure/table-3d/face-geometry';
import type {
  Table3dCamera,
  Table3dEngine,
  Table3dEngineOptions,
  Table3dGrid,
  Table3dStats,
} from '@axe/infrastructure/table-3d/table-3d-port';
import { disposeObject } from '@axe/infrastructure/three-kit/dispose';
import { float, max, sRGBTransferEOTF, sRGBTransferOETF, texture, type vec3, vec4 } from 'three/tsl';
import {
  BufferGeometry,
  Camera,
  CanvasTexture,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
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

/** What a face wears: the picture, how it is laid, and whether it is glass. */
type FaceLook = { pictureUrl: string; tilePx: number; glass: boolean };

/** The key faces drawn with one material share. */
function lookOf(face: FaceLook): string {
  return face.glass || !face.pictureUrl ? 'glass' : `${face.pictureUrl}|${face.tilePx > 0}`;
}

/** How far above the board the grid is laid, as the page lifts it. */
const GRID_LIFT_PX = 0.15;

/** How a glass face is drawn: a pale blue, mostly clear. */
const GLASS_COLOUR = 0xcfe6ff;
const GLASS_OPACITY = 0.25;

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
  private readonly loaded = new Map<string, Texture>();
  private readonly facesRoot = new Group();
  private readonly chunks = new Map<string, { owners: Map<string, string>; meshes: Group }>();
  private readonly looks = new Map<string, MeshBasicNodeMaterial>();
  private grid: Mesh | null = null;
  private gridPicture: CanvasTexture | null = null;
  private gridDrawn = '';
  private lastGrid: Table3dGrid | null = null;
  private gridded: readonly TableWorldCap[] = [];
  private topsGrid: Mesh | null = null;

  constructor(
    private readonly renderer: WebGPURenderer,
    readonly backend: 'webgpu' | 'webgl2'
  ) {
    for (const camera of [this.perspective, this.orthographic]) camera.matrixAutoUpdate = false;
    this.scene.add(this.facesRoot);
  }

  onNeedsFrame(listener: () => void): void {
    this.needsFrame = listener;
  }

  isLoading(): boolean {
    return this.loading > 0;
  }

  stats(): Table3dStats {
    const shown = (mesh: Mesh | null) => (mesh?.visible ? mesh.geometry.getAttribute('position').count / 3 : 0);
    return {
      chunks: this.chunks.size,
      boardGridTriangles: shown(this.grid),
      topsGridTriangles: shown(this.topsGrid),
    };
  }

  onLost(listener: () => void): void {
    this.renderer.onDeviceLost = () => {
      this.lost = true;
      listener();
    };
  }

  setWorld(world: TableWorld): void {
    this.placeBoard(world.board);
    this.placeFaces(world.walls, world.caps, world.board?.gridSize ?? 50);
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

  setGrid(grid: Table3dGrid | null): void {
    const drawn = grid ? JSON.stringify([grid.box, grid.revision]) : '';
    this.lastGrid = grid;
    if (drawn !== this.gridDrawn) {
      this.gridDrawn = drawn;
      this.placeGrid(grid);
      this.placeTopsGrid();
    } else if (grid) {
      for (const mesh of [this.grid, this.topsGrid]) {
        if (mesh) (mesh.material as MeshBasicNodeMaterial).opacity = grid.opacity;
      }
    }
    for (const mesh of [this.grid, this.topsGrid]) {
      if (mesh) mesh.visible = (grid?.opacity ?? 0) > 0;
    }
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
    for (const picture of this.loaded.values()) picture.dispose();
    for (const material of this.looks.values()) material.dispose();
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

  /**
   * Lays the page's grid canvas over the board where the page lays it, a hair above the board as the
   * page lifts it, drawn again from the canvas whenever the page draws on it.
   */
  private placeGrid(grid: Table3dGrid | null): void {
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as MeshBasicNodeMaterial).dispose();
      this.grid = null;
    }
    if (!grid) {
      this.gridPicture?.dispose();
      this.gridPicture = null;
      return;
    }
    if (this.gridPicture?.image !== grid.canvas) {
      this.gridPicture?.dispose();
      this.gridPicture = new CanvasTexture(grid.canvas);
      this.gridPicture.colorSpace = SRGBColorSpace;
    }
    this.gridPicture.needsUpdate = true;
    const geometry = new PlaneGeometry(grid.box.width, grid.box.height);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(grid.box.x + grid.box.width / 2, GRID_LIFT_PX, grid.box.y + grid.box.height / 2);
    const material = new MeshBasicNodeMaterial({
      map: this.gridPicture,
      transparent: true,
      opacity: grid.opacity,
      depthWrite: false,
    });
    this.grid = new Mesh(geometry, material);
    this.grid.renderOrder = 1;
    this.scene.add(this.grid);
  }

  /**
   * Lays out the faces of the blocks and of the table's walls in chunks of the table's cells, and
   * builds again only the chunks where anything changed: a block moved takes the chunk it left and
   * the one it came to. Within a chunk the faces wearing the same picture the same way are drawn as
   * one shape, so a chunk is drawn in as many calls as it has pictures rather than faces.
   */
  private placeFaces(walls: readonly TableWorldWall[], caps: readonly TableWorldCap[], gridSize: number): void {
    const owned = facesByOwner(walls, caps, gridSize);
    const wanted = chunkSignatures(owned);
    const before = new Map([...this.chunks].map(([key, chunk]) => [key, chunk.owners]));
    for (const key of changedChunks(before, wanted)) this.buildChunk(key, wanted.get(key) ?? null, owned);
    this.gridded = caps.filter((cap) => cap.gridded);
    this.placeTopsGrid();
  }

  private buildChunk(key: string, owners: Map<string, string> | null, owned: ReadonlyMap<string, OwnedFaces>): void {
    const old = this.chunks.get(key);
    if (old) {
      this.facesRoot.remove(old.meshes);
      old.meshes.traverse((object) => (object as Mesh).geometry?.dispose());
      this.chunks.delete(key);
    }
    if (!owners) return;
    const byLook = new Map<string, { face: FaceLook; shapes: BufferGeometry[] }>();
    const add = (face: FaceLook, shape: BufferGeometry) => {
      const look = byLook.get(lookOf(face)) ?? { face, shapes: [] };
      look.shapes.push(shape);
      byLook.set(lookOf(face), look);
    };
    for (const owner of owners.keys()) {
      const entry = owned.get(owner)!;
      for (const wall of entry.walls) add(wall, wallGeometry(wall));
      for (const cap of entry.caps) add(cap, capGeometry(cap));
    }
    const meshes = new Group();
    for (const [look, { face, shapes }] of byLook) {
      meshes.add(new Mesh(mergedFaces(shapes), this.sharedLook(look, face)));
      for (const shape of shapes) shape.dispose();
    }
    this.chunks.set(key, { owners, meshes });
    this.facesRoot.add(meshes);
  }

  /** The material every face wearing one picture one way is drawn with, made once. */
  private sharedLook(look: string, face: FaceLook): MeshBasicNodeMaterial {
    let material = this.looks.get(look);
    if (!material) {
      material = this.faceMaterial(face);
      this.looks.set(look, material);
    }
    return material;
  }

  /** Lays the table's grid over the tops of the blocks that wear it, as it shows on the board. */
  private placeTopsGrid(): void {
    if (this.topsGrid) {
      this.scene.remove(this.topsGrid);
      this.topsGrid.geometry.dispose();
      (this.topsGrid.material as MeshBasicNodeMaterial).dispose();
      this.topsGrid = null;
    }
    const grid = this.lastGrid;
    if (!grid || !this.gridPicture || this.gridded.length === 0) return;
    const material = new MeshBasicNodeMaterial({
      map: this.gridPicture,
      transparent: true,
      opacity: grid.opacity,
      depthWrite: false,
      side: DoubleSide,
    });
    this.topsGrid = new Mesh(griddedTops(this.gridded, grid.box, GRID_LIFT_PX), material);
    this.topsGrid.renderOrder = 1;
    this.topsGrid.visible = grid.opacity > 0;
    this.scene.add(this.topsGrid);
  }

  private faceMaterial(face: { pictureUrl: string; tilePx: number; glass: boolean }): MeshBasicNodeMaterial {
    if (face.glass || !face.pictureUrl) {
      return new MeshBasicNodeMaterial({
        color: GLASS_COLOUR,
        transparent: true,
        opacity: GLASS_OPACITY,
        depthWrite: false,
        side: DoubleSide,
      });
    }
    const material = new MeshBasicNodeMaterial({ side: DoubleSide, transparent: true, alphaTest: 0.01 });
    material.map = this.sharedPicture(face.pictureUrl, face.tilePx > 0);
    return material;
  }

  /** A picture shared by every face that wears it the same way, tiled or stretched. */
  private sharedPicture(url: string, tiled: boolean): Texture {
    const key = `${url}|${tiled}`;
    let picture = this.loaded.get(key);
    if (!picture) {
      picture = this.picture(url);
      if (tiled) picture.wrapS = picture.wrapT = RepeatWrapping;
      this.loaded.set(key, picture);
    }
    return picture;
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
