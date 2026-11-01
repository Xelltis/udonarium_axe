import { Table3dService } from '@axe/application/tabletop/table-3d.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { pageOfTablePoint, TableCameraView } from '@axe/domain/tabletop/camera/table-camera';
import { PickTarget } from '@axe/domain/tabletop/pick/pick-index';

/** What the end-to-end suite can ask the table, in a browser driven by automation. */
export interface TableTestHooks {
  /** The identifier of what a point of the page lands on, or null. */
  pickAt(pageX: number, pageY: number): string | null;
  /** The identifiers of everything the line of sight through a point of the page meets, nearest first. */
  pickAllAt(pageX: number, pageY: number): string[];
  /** The identifier of the piece the page draws in front at a point, or null, while the table is drawn in the page. */
  drawnAt(pageX: number, pageY: number): string | null;
  /** Where a point of the board is drawn on the page, or null before the table has a camera. */
  project(x: number, y: number, z: number): { x: number; y: number } | null;
  /** The view the table last drew. */
  camera(): TableCameraView | null;
  /** What kind of object an identifier names, such as `terrain` or `character`, or null. */
  aliasOf(identifier: string): string | null;
  /**
   * The edges of the solids things are picked by, as drawn on the page: each as `[x1, y1, x2, y2]`.
   * A point within a pixel or two of one may be told apart differently by the page and by picking.
   */
  edgesOnPage(): [number, number, number, number][];
  /** The face a piece let go of at a point of the page would be put on, or null. */
  faceAt(pageX: number, pageY: number): string | null;
  /** The interface the canvas draws the table through, or null while the table is not drawn on one. */
  renderer(): 'webgpu' | 'webgl2' | null;
  /** Settles once the canvas has drawn everything it was told, or at once while there is no canvas. */
  whenIdle(): Promise<void>;
  /** What the canvas's engine holds, counted, or null while there is none. */
  sceneStats(): { chunks: number; boardGridTriangles: number; topsGridTriangles: number; sprites: number } | null;
  /** How wide and deep the board of the scene runs, in table pixels, or null where there is no board. */
  sceneBoard(): { widthPx: number; depthPx: number } | null;
  /**
   * The boxes on the page round each sprite a piece is picked by, in the order the piece is drawn
   * with them: for a die, its frame and then its picture.
   */
  pieceBoxesOnPage(identifier: string): { x: number; y: number; width: number; height: number }[];
  /** Where a point of a face (the floor, a wall or a board), lifted some way off it, is drawn on the page. */
  surfacePageOf(surface: string, localX: number, localY: number, height?: number): { x: number; y: number } | null;
}

type HookedWindow = Window & { __axeTable?: TableTestHooks };

/**
 * Puts the table's test hooks on the window, in a browser that says automation drives it and in
 * no other. Answers the function that takes them off again.
 */
export function installTableTestHooks(
  win: Window,
  pick: TablePickService,
  camera: TableCameraService,
  overlap: TabletopOverlapService,
  surfaces: TableSurfaceService,
  scene: Table3dService
): () => void {
  if (!win.navigator.webdriver) return () => undefined;
  const hooked = win as HookedWindow;
  hooked.__axeTable = {
    pickAt: (pageX, pageY) => pick.pickAt(pageX, pageY)?.target.id ?? null,
    pickAllAt: (pageX, pageY) => pick.allAt(pageX, pageY).map((hit) => hit.target.id),
    drawnAt: (pageX, pageY) => overlap.drawnAt(pageX, pageY)?.identifier ?? null,
    project: (x, y, z) => {
      const scene = camera.sceneMatrix();
      if (!scene) return null;
      const onPage = pageOfTablePoint(scene, x, y, z);
      return { x: onPage.x, y: onPage.y };
    },
    camera: () => camera.view,
    aliasOf: (identifier) => ObjectStore.instance.get(identifier)?.aliasName ?? null,
    renderer: () => scene.backend(),
    whenIdle: () => scene.whenIdle(),
    sceneStats: () => scene.stats(),
    sceneBoard: () => {
      const board = scene.world().board;
      return board ? { widthPx: board.widthPx, depthPx: board.depthPx } : null;
    },
    faceAt: (pageX, pageY) => pick.faceAt(pageX, pageY, { stopsAt: () => true }),
    surfacePageOf: (surface, localX, localY, height) => surfaces.pageOf(surface, localX, localY, height),
    pieceBoxesOnPage: (identifier) => {
      const scene = camera.sceneMatrix();
      const target = pick.pieceTargets().find((candidate) => candidate.id === identifier);
      if (!scene || !target) return [];
      return target.shapes.flatMap((shape) => {
        if (shape.kind !== 'quad') return [];
        const corners = shape.corners.map((corner) => pageOfTablePoint(scene, corner.x, corner.y, corner.z));
        const xs = corners.map((corner) => corner.x);
        const ys = corners.map((corner) => corner.y);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        return [{ x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }];
      });
    },
    edgesOnPage: () => {
      const scene = camera.sceneMatrix();
      return scene
        ? pick.targets().flatMap((target) => edgesOf(target, (x, y, z) => pageOfTablePoint(scene, x, y, z)))
        : [];
    },
  };
  return () => {
    delete hooked.__axeTable;
  };
}

/** The edges of a target's solids, carried onto the page: the rims of their tops and bases, and their uprights. */
function edgesOf(
  target: PickTarget,
  onPage: (x: number, y: number, z: number) => { x: number; y: number }
): [number, number, number, number][] {
  const edges: [number, number, number, number][] = [];
  for (const shape of target.shapes) {
    if (shape.kind !== 'prism') continue;
    const tops = shape.outline.map((point) => onPage(point.x, point.y, shape.top));
    const bases = shape.outline.map((point) => onPage(point.x, point.y, shape.base));
    tops.forEach((top, i) => {
      const next = (i + 1) % tops.length;
      edges.push([top.x, top.y, tops[next].x, tops[next].y]);
      edges.push([bases[i].x, bases[i].y, bases[next].x, bases[next].y]);
      edges.push([top.x, top.y, bases[i].x, bases[i].y]);
    });
  }
  return edges;
}
