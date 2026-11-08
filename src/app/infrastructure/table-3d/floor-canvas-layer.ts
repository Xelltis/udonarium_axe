import type { GroundMesh } from '@axe/domain/tabletop/world/ground-mesh';
import { gridOverGround } from '@axe/infrastructure/table-3d/face-geometry';
import type { Table3dFloorCanvas } from '@axe/infrastructure/table-3d/table-3d-port';
import {
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three/webgpu';

/**
 * Where what the page paints on the floor comes in the order things are drawn: after the board,
 * the blocks and the grid, and before the sprites, which stand and lie over it.
 */
const FLOOR_CANVAS_ORDER = 2;

interface Laid {
  readonly mesh: Mesh;
  readonly picture: CanvasTexture;
  revision: number;
  /** Where the canvas was last laid over the ground, or empty while it lies on a flat square. */
  draped: string;
  /** Where the canvas is laid, as it was last given. */
  floor: Table3dFloorCanvas;
}

/**
 * What the page paints on canvases of its own and lays on the board, as where a piece may move:
 * each canvas a square of the scene lying at its height, or over raised ground the ground's own mesh
 * lifted by that height, wearing the canvas as it is painted, and taken up again each time the page
 * paints it anew. Blocks standing over it hide it.
 */
export class FloorCanvasLayer {
  readonly group = new Group();
  private readonly square = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly laid = new Map<string, Laid>();
  private ground: GroundMesh | null = null;
  private groundKey = 0;

  /**
   * Lays every canvas over the raised ground from now on, following it, or flat again where there is
   * none.
   */
  setGround(ground: GroundMesh | null): void {
    if (ground === this.ground) return;
    this.ground = ground;
    this.groundKey++;
    for (const laid of this.laid.values()) this.place(laid, laid.floor);
  }

  set(canvases: readonly Table3dFloorCanvas[]): void {
    const wanted = new Set<string>();
    for (const floor of canvases) {
      wanted.add(floor.id);
      let laid = this.laid.get(floor.id);
      if (laid && laid.picture.image !== floor.canvas) {
        this.drop(floor.id, laid);
        laid = undefined;
      }
      if (!laid) {
        const picture = new CanvasTexture(floor.canvas);
        picture.colorSpace = SRGBColorSpace;
        const material = new MeshBasicNodeMaterial({
          map: picture,
          transparent: true,
          depthWrite: false,
          side: DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -8,
        });
        laid = { mesh: new Mesh(this.square, material), picture, revision: -1, draped: '', floor };
        laid.mesh.renderOrder = FLOOR_CANVAS_ORDER;
        this.laid.set(floor.id, laid);
        this.group.add(laid.mesh);
      }
      if (laid.revision !== floor.revision) {
        laid.revision = floor.revision;
        laid.picture.needsUpdate = true;
      }
      laid.floor = floor;
      this.place(laid, floor);
    }
    for (const [id, laid] of this.laid) if (!wanted.has(id)) this.drop(id, laid);
  }

  /**
   * Lays a canvas over its box: a flat square at its height over a flat board, or the ground's own
   * mesh lifted by its height, the canvas stretched over its box on it.
   */
  private place(laid: Laid, floor: Table3dFloorCanvas): void {
    const { x, y, width, height } = floor.box;
    if (!this.ground) {
      if (laid.draped) {
        laid.mesh.geometry.dispose();
        laid.mesh.geometry = this.square;
        laid.draped = '';
      }
      laid.mesh.position.set(x + width / 2, floor.heightPx, y + height / 2);
      laid.mesh.scale.set(width, 1, height);
      return;
    }
    const draped = `${this.groundKey}|${x}|${y}|${width}|${height}|${floor.heightPx}`;
    if (laid.draped === draped) return;
    if (laid.draped) laid.mesh.geometry.dispose();
    laid.mesh.geometry = gridOverGround(this.ground, floor.box, floor.heightPx);
    laid.mesh.position.set(0, 0, 0);
    laid.mesh.scale.set(1, 1, 1);
    laid.draped = draped;
  }

  dispose(): void {
    for (const [id, laid] of this.laid) this.drop(id, laid);
    this.square.dispose();
  }

  private drop(id: string, laid: Laid): void {
    this.group.remove(laid.mesh);
    if (laid.draped) laid.mesh.geometry.dispose();
    laid.picture.dispose();
    (laid.mesh.material as MeshBasicNodeMaterial).dispose();
    this.laid.delete(id);
  }
}
