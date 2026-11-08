import { DiceRenderService } from '@axe/application/dice/dice-render.service';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { HudFrameService } from '@axe/application/tabletop/hud-frame.service';
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { PiecePicturesService } from '@axe/application/tabletop/piece-pictures.service';
import { Table3dService } from '@axe/application/tabletop/table-3d.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import {
  DEFAULT_TABLE_CAMERA_VIEW,
  pageOfTablePoint,
  TableCameraView,
  TableLayout,
} from '@axe/domain/tabletop/camera/table-camera';
import { framingView } from '@axe/domain/tabletop/camera/table-framing';
import { PickTarget } from '@axe/domain/tabletop/pick/pick-index';
import { partOf } from '@axe/domain/tabletop/world/page-boxes';
import { pointOnFace } from '@axe/domain/tabletop/world/table-sprites';
import { putAwayTutorial } from '@axe/features/tabletop/tutorial/put-away-tutorial';

/** What the end-to-end suite can ask the table, in a browser driven by automation. */
export interface TableTestHooks {
  /** The identifier of what a point of the page lands on, or null. */
  pickAt(pageX: number, pageY: number): string | null;
  /** The identifier of what a press at a point of the page is handed to, past blocks locked in front of a piece, or null. */
  pressedAt(pageX: number, pageY: number): string | null;
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
   * The edges of the shapes things are picked by, as drawn on the page: each as `[x1, y1, x2, y2]`.
   * A point within a pixel or two of one may be told apart differently by the page and by picking.
   */
  edgesOnPage(): [number, number, number, number][];
  /** The face a piece let go of at a point of the page would be put on, or null. */
  faceAt(pageX: number, pageY: number): string | null;
  /** The interface the canvas draws the table through, or null while the table is not drawn on one. */
  renderer(): 'webgpu' | 'webgl2' | null;
  /**
   * Settles once the canvas has drawn everything it was told and what the screen lays over it is
   * where the canvas draws it, or at once while there is no canvas.
   */
  whenIdle(): Promise<void>;
  /**
   * Draws at once whatever the canvas waits on a frame to draw, and answers whether it is drawn
   * through: no picture of a piece being taken for it, nothing loading, nothing left to draw. For a
   * page whose clock is held, where no frame comes until the clock is moved on.
   */
  drawDueNow(): boolean;
  /** What a frame drawn at once still waits for before it shows all the canvas was told, none once it shows it all. */
  busy(): string[];
  /** Holds the flickering lights of the canvas as they are at a moment, or lets them flicker by the clock again given null. */
  holdFlicker(timeMs: number | null): void;
  /** Has what moves by itself on the canvas drawn only by `drawDueNow`, or by the clock again given false. */
  holdMotion(held: boolean): void;
  /** Has the canvas ready the graphics card for a new kind of thing before drawing it, or build it as it draws. */
  readyBeforeDrawing(on: boolean): void;
  /** Has the lights that throw shadows of their own chosen from where the camera looks now, as though none did yet. */
  chooseLightsAfresh(): void;
  /** Holds every piece playing a move as far into it as asked, in milliseconds, or lets them play by the clock again given null. */
  holdMovesAt(ms: number | null): void;
  /** Whether a piece is playing a move on the canvas now, as a die tumbling or coming into view. */
  moving(identifier: string): boolean;
  /** How high the raised ground of the table in view stands at a point of the board, in table pixels. */
  groundAt(x: number, y: number): number;
  /**
   * The shares of paint the ground of the table in view wears at a point of the board, in table pixels:
   * grass, dirt, rock and sand, each out of fifteen, or null where it wears none.
   */
  paintAt(x: number, y: number): number[] | null;
  /** What the canvas's engine holds, counted, or null while there is none. */
  sceneStats(): {
    chunks: number;
    boardGridTriangles: number;
    topsGridTriangles: number;
    sprites: number;
    coins: number;
    layers: number;
    waterParts: number;
    fogAirSheets: number;
    sky: boolean;
    backdrops: number;
    models: number;
    modelMeshes: number;
    veilRevision: number;
    lightMapRevision: number;
    shadowCasters: number;
    draws: number;
    drawCalls: number;
  } | null;
  /** How wide and deep the board of the scene runs, in table pixels, or null where there is no board. */
  sceneBoard(): { widthPx: number; depthPx: number } | null;
  /**
   * The boxes on the page round each shape a piece is picked by, in the order the piece is drawn
   * with them: for a die, its frame and then its picture; for a coin, the side turned out.
   */
  pieceBoxesOnPage(identifier: string): { x: number; y: number; width: number; height: number }[];
  /** Where a point of a face (the floor, a wall or a board), lifted some way off it, is drawn on the page. */
  surfacePageOf(surface: string, localX: number, localY: number, height?: number): { x: number; y: number } | null;
  /** How wide and how tall a face is, in its own pixels, or null for a face the table does not have. */
  surfaceSizeOf(surface: string): { width: number; height: number } | null;
  /** The sprites a piece is drawn with, each named as its part and as large as it is drawn, in table pixels. */
  spritesOf(identifier: string): { part: string; widthPx: number; heightPx: number }[];
  /** Keeps the dice at rest on the table on show until let go, however slowly frames are drawn. */
  keepDiceResting(on: boolean): void;
  /** Takes the first table's tutorial away, as its menu does, for a spec the tutorial would stand in the way of. Answers how many things went. */
  putAwayTutorial(): number;
  /**
   * Puts the camera near the board, at the default view's depth and angle, over the middle of the
   * table, in place of the first view that brings the whole first table in: the view specs that
   * handle pieces are measured at.
   */
  lookFromNear(): void;
}

type HookedWindow = Window & { __axeTable?: TableTestHooks };

/** The default view's depth and angle, moved across to stand over the middle of the board. */
function nearView(layout: TableLayout): TableCameraView {
  const width = layout.boardWidth;
  const depth = layout.boardHeight;
  const corners = [
    { x: 0, y: 0, z: 0 },
    { x: width, y: 0, z: 0 },
    { x: 0, y: depth, z: 0 },
    { x: width, y: depth, z: 0 },
  ];
  const depthOfDefault = DEFAULT_TABLE_CAMERA_VIEW.positionZ;
  return framingView(
    DEFAULT_TABLE_CAMERA_VIEW,
    layout,
    corners,
    { top: 0, right: 0, bottom: 0, left: 0 },
    { furthest: depthOfDefault, nearest: depthOfDefault }
  );
}

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
  scene: Table3dService,
  hud: HudFrameService,
  motions: PieceMotionsService,
  ground: GroundService,
  pictures: PiecePicturesService,
  dice: DiceRenderService,
  tabletop: TabletopService,
  moveCamera: (view: TableCameraView) => void
): () => void {
  if (!win.navigator.webdriver) return () => undefined;
  const hooked = win as HookedWindow;
  hooked.__axeTable = {
    pickAt: (pageX, pageY) => pick.pickAt(pageX, pageY)?.target.id ?? null,
    pressedAt: (pageX, pageY) => pick.pressedAt(pageX, pageY)?.target.id ?? null,
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
    whenIdle: () => scene.whenIdle().then(() => hud.writeNow()),
    busy: () => [
      ...(pictures.taking() > 0 ? [`${pictures.taking()} pictures of pieces being taken`] : []),
      ...scene.busyWith(),
    ],
    drawDueNow: () => {
      const drawn = pictures.taking() === 0 && scene.drawDueNow();
      hud.writeNow();
      return drawn;
    },
    holdFlicker: (timeMs) => scene.holdFlicker(timeMs),
    holdMotion: (held) => scene.holdMotion(held),
    readyBeforeDrawing: (on) => scene.readyBeforeDrawing(on),
    chooseLightsAfresh: () => scene.chooseLightsAfresh(),
    holdMovesAt: (ms) => motions.holdAt(ms),
    moving: (identifier) => motions.isPlaying(identifier),
    groundAt: (x, y) => ground.heightPxAt(x, y),
    paintAt: (x, y) => {
      const shares = ground.paintPxAt(x, y);
      return shares ? Array.from(shares) : null;
    },
    sceneStats: () => scene.stats(),
    keepDiceResting: (on) => dice.keepResting(on),
    putAwayTutorial: () => putAwayTutorial(tabletop),
    lookFromNear: () => {
      const layout = camera.layout;
      if (layout) moveCamera(nearView(layout));
    },
    spritesOf: (identifier) =>
      scene
        .world()
        .sprites.filter((sprite) => sprite.owner === identifier)
        .map((sprite) => ({ part: partOf(sprite), widthPx: sprite.widthPx, heightPx: sprite.heightPx })),
    sceneBoard: () => {
      const board = scene.world().board;
      return board ? { widthPx: board.widthPx, depthPx: board.depthPx } : null;
    },
    faceAt: (pageX, pageY) => pick.faceAt(pageX, pageY, { stopsAt: () => true }),
    surfacePageOf: (surface, localX, localY, height) => surfaces.pageOf(surface, localX, localY, height),
    surfaceSizeOf: (surface) => surfaces.sizeOf(surface),
    pieceBoxesOnPage: (identifier) => {
      const scene = camera.sceneMatrix();
      const target = pick.pieceTargets().find((candidate) => candidate.id === identifier);
      if (!scene || !target) return [];
      const boxRound = (corners: { x: number; y: number }[]) => {
        const xs = corners.map((corner) => corner.x);
        const ys = corners.map((corner) => corner.y);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
      };
      return target.shapes.flatMap((shape) => {
        if (shape.kind === 'quad') {
          return [boxRound(shape.corners.map((corner) => pageOfTablePoint(scene, corner.x, corner.y, corner.z)))];
        }
        if (shape.kind === 'on-face' && shape.shape.kind === 'cylinder') {
          const disc = shape.shape;
          const rim = Array.from({ length: 64 }, (_, i) => {
            const turn = (i / 64) * Math.PI * 2;
            const at = pointOnFace(
              shape.frame,
              disc.centerX + Math.cos(turn) * disc.radius,
              disc.centerY + Math.sin(turn) * disc.radius,
              disc.top
            );
            return pageOfTablePoint(scene, at.x, at.y, at.z);
          });
          return [boxRound(rim)];
        }
        return [];
      });
    },
    edgesOnPage: () => {
      const scene = camera.sceneMatrix();
      return scene
        ? [...pick.targets(), ...pick.pieceTargets()].flatMap((target) =>
            edgesOf(target, (x, y, z) => pageOfTablePoint(scene, x, y, z))
          )
        : [];
    },
  };
  return () => {
    delete hooked.__axeTable;
  };
}

/**
 * The edges of a target's shapes, carried onto the page: the rims of a solid's top and base and its
 * uprights, the sides of a flat shape, and the rims of a disc's two sides.
 */
function edgesOf(
  target: PickTarget,
  onPage: (x: number, y: number, z: number) => { x: number; y: number }
): [number, number, number, number][] {
  const edges: [number, number, number, number][] = [];
  const round = (points: { x: number; y: number }[]) =>
    points.forEach((point, i) => {
      const next = points[(i + 1) % points.length];
      edges.push([point.x, point.y, next.x, next.y]);
    });
  for (const shape of target.shapes) {
    if (shape.kind === 'quad') {
      round(shape.corners.map((corner) => onPage(corner.x, corner.y, corner.z)));
    } else if (shape.kind === 'on-face' && shape.shape.kind === 'cylinder') {
      const disc = shape.shape;
      for (const height of [disc.base, disc.top]) {
        round(
          Array.from({ length: 64 }, (_, i) => {
            const turn = (i / 64) * Math.PI * 2;
            const at = pointOnFace(
              shape.frame,
              disc.centerX + Math.cos(turn) * disc.radius,
              disc.centerY + Math.sin(turn) * disc.radius,
              height
            );
            return onPage(at.x, at.y, at.z);
          })
        );
      }
    } else if (shape.kind === 'prism') {
      const tops = shape.outline.map((point) => onPage(point.x, point.y, shape.top));
      const bases = shape.outline.map((point) => onPage(point.x, point.y, shape.base));
      round(tops);
      round(bases);
      tops.forEach((top, i) => edges.push([top.x, top.y, bases[i].x, bases[i].y]));
    }
  }
  return edges;
}
