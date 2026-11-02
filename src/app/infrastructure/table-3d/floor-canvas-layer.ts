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
 * the blocks and the grid, and before the sprites lying flat on a face, which lie over it.
 */
const FLOOR_CANVAS_ORDER = 2;

interface Laid {
  readonly mesh: Mesh;
  readonly picture: CanvasTexture;
  revision: number;
}

/**
 * What the page paints on canvases of its own and lays on the board, as where a piece may move:
 * each canvas a square of the scene lying at its height, wearing the canvas as it is painted, and
 * taken up again each time the page paints it anew. Blocks standing over it hide it.
 */
export class FloorCanvasLayer {
  readonly group = new Group();
  private readonly square = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly laid = new Map<string, Laid>();

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
        laid = { mesh: new Mesh(this.square, material), picture, revision: -1 };
        laid.mesh.renderOrder = FLOOR_CANVAS_ORDER;
        this.laid.set(floor.id, laid);
        this.group.add(laid.mesh);
      }
      if (laid.revision !== floor.revision) {
        laid.revision = floor.revision;
        laid.picture.needsUpdate = true;
      }
      const { x, y, width, height } = floor.box;
      laid.mesh.position.set(x + width / 2, floor.heightPx, y + height / 2);
      laid.mesh.scale.set(width, 1, height);
    }
    for (const [id, laid] of this.laid) if (!wanted.has(id)) this.drop(id, laid);
  }

  dispose(): void {
    for (const [id, laid] of this.laid) this.drop(id, laid);
    this.square.dispose();
  }

  private drop(id: string, laid: Laid): void {
    this.group.remove(laid.mesh);
    laid.picture.dispose();
    (laid.mesh.material as MeshBasicNodeMaterial).dispose();
    this.laid.delete(id);
  }
}
