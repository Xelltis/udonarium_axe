import { effect, EffectRef, inject, Injectable, Injector, untracked } from '@angular/core';
import { StandingGroundService } from '@axe/application/tabletop/standing-ground.service';
import { Table3dService } from '@axe/application/tabletop/table-3d.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableEyeService } from '@axe/application/tabletop/table-eye.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { tableEyeMatrix } from '@axe/domain/tabletop/camera/table-camera';
import {
  blockPageBoxes,
  drawnRanks,
  PageBox,
  PiecePageBoxes,
  piecePageBoxes,
  quadMatrix,
} from '@axe/domain/tabletop/world/page-boxes';
import { eyeAxesOf } from '@axe/domain/tabletop/world/table-sprites';

/**
 * Where an element of the screen over a table drawn on a canvas is put against the part of the piece
 * it goes with: over the part, stretched to its box; above or below its middle, at the size the part
 * is drawn at, as a name hangs over a piece; laid on the part itself, its own box drawn onto the
 * part's corners in perspective, as a note's text is laid on the note while it is written; or laid
 * so at the size the part is on the table, to cover the part, as a card is pointed at by its face.
 */
export type HudPlace = 'box' | 'above' | 'below' | 'face' | 'cover';

/** What an element is put against: a piece, and a part of it, or the whole piece where none is named. */
export interface HudAnchor {
  readonly owner: string;
  readonly part?: string;
  readonly place?: HudPlace;
  /**
   * A point of a face, in the face's own pixels and lifted some way off it, to put the element's
   * middle on, rather than a part: as a handle that turns a piece about a point of its own.
   */
  readonly at?: { readonly surface: string; readonly x: number; readonly y: number; readonly height: number };
  /** Whether an element put on a point is drawn at the size the table is drawn at there, as one lying on the face. */
  readonly scaled?: boolean;
  /**
   * Another point of a face, for an element laid from the point `at` to it as a line: its top left on
   * the one, running down its height to the other, as the guide down from a piece raised off the floor.
   */
  readonly reach?: { readonly surface: string; readonly x: number; readonly y: number; readonly height: number };
  /**
   * A corner of the part, round from its top left as a picture on it is read, to put the element's
   * middle on: as the handles at a board's foot.
   */
  readonly corner?: 0 | 1 | 2 | 3;
  /**
   * The middle of an edge of the part, as a picture on it is read, to put the element's middle on:
   * as the handles at the head and the foot of a character's picture.
   */
  readonly edge?: 'top' | 'right' | 'bottom' | 'left';
  /**
   * For a root of a piece holding its controls rather than the piece, as the handle that turns a
   * range: drawn over the roots of every piece, those raised so among themselves as their pieces, so
   * that no piece drawn over its own covers a control of it.
   */
  readonly raised?: boolean;
  /**
   * A rectangle lying on a face, its corners round from its top left in the face's own pixels and
   * lifted some way off it, to lay the element on in perspective at the size given in those pixels,
   * rather than a part: as the frame round the foot of a thing that turns it, which none of the
   * thing's own parts lies on.
   */
  readonly lay?: HudLay;
}

/** A rectangle lying on a face for an element to be laid on; see {@link HudAnchor.lay}. */
export interface HudLay {
  readonly surface: string;
  readonly corners: readonly [FacePoint, FacePoint, FacePoint, FacePoint];
  readonly height: number;
  readonly width: number;
  readonly depth: number;
}

/** A point of a face, in the face's own pixels. */
interface FacePoint {
  readonly x: number;
  readonly y: number;
}

/** The corners an edge of a part runs between, round from its top left. */
const EDGE_CORNERS = { top: [0, 1], right: [1, 2], bottom: [2, 3], left: [3, 0] } as const;

interface Placed {
  anchor: HudAnchor;
  written: string | null;
}

/**
 * How much larger than life what is told about a piece may be drawn while the table's camera
 * follows a piece about, standing near the pieces round it.
 */
const FOLLOWING_LARGEST_SCALE = 1.25;

/**
 * Puts the elements of the screen over a table drawn on a canvas where the pieces they go with are
 * drawn, in the frame after the camera or the pieces move, by writing their styles rather than
 * through change detection.
 *
 * The element put against a whole piece is its root, put on the page; it is drawn over the root of
 * a piece drawn further off. Every other element of a piece lies in that root and is put against it.
 * A piece may have a second root raised over every piece's, for controls no other piece is to cover.
 * An element whose piece or part is not drawn is hidden, as is all of the piece the table's camera
 * follows from behind.
 */
@Injectable({ providedIn: 'root' })
export class HudFrameService {
  private readonly camera = inject(TableCameraService);
  private readonly eyes = inject(TableEyeService);
  private readonly pieces = inject(TablePiecesService);
  private readonly pick = inject(TablePickService);
  private readonly scene = inject(Table3dService);
  private readonly surfaces = inject(TableSurfaceService);
  private readonly standing = inject(StandingGroundService);
  private readonly tabletop = inject(TabletopService);
  private readonly injector = inject(Injector);
  private readonly placed = new Map<HTMLElement, Placed>();
  private following: EffectRef | null = null;
  private frame: number | null = null;

  /**
   * Puts an element against a piece from now on. Hands back the way to stop. An element not put
   * anywhere yet is hidden until it is, rather than shown for a frame where it was laid out.
   */
  place(element: HTMLElement, anchor: HudAnchor): () => void {
    if (!element.style.transform) element.style.visibility = 'hidden';
    const placed: Placed = { anchor, written: null };
    this.placed.set(element, placed);
    this.follow();
    this.writeSoon();
    return () => {
      if (this.placed.get(element) !== placed) return;
      this.placed.delete(element);
      if (this.placed.size === 0) {
        this.following?.destroy();
        this.following = null;
      }
    };
  }

  /**
   * Where every piece drawn on the table, and every block something is put against, shows on the
   * page now, or null before the camera is set. The other blocks, which a table of a great many
   * has, are left out.
   */
  boxesNow(): Map<string, PiecePageBoxes> | null {
    const scene = this.camera.sceneMatrix();
    const view = this.camera.view;
    const layout = this.camera.layout;
    if (!scene || !view || !layout) return null;
    const eye = eyeAxesOf(tableEyeMatrix(view, layout));
    const ground = untracked(this.standing.surface);
    const gridSize = this.tabletop.currentTable.gridSize > 0 ? this.tabletop.currentTable.gridSize : 50;
    const groundAt = ground.isFlat
      ? undefined
      : (x: number, y: number) => ground.heightAt(x / gridSize, y / gridSize) * gridSize;
    const boxes = piecePageBoxes(untracked(this.pieces.sprites), untracked(this.pieces.coins), scene, eye, groundAt);
    const owners = new Set<string>();
    for (const { anchor } of this.placed.values()) if (!boxes.has(anchor.owner)) owners.add(anchor.owner);
    for (const [id, block] of blockPageBoxes(this.pick.targetsOf(owners), scene, eye, groundAt)) boxes.set(id, block);
    return boxes;
  }

  /** Puts every element where it goes now, rather than in the next frame. */
  writeNow(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.write();
  }

  /**
   * Writes again whenever the camera, the pieces or the blocks move. Started by the first element
   * put, which may be put from within an effect, out of which an effect cannot be made.
   */
  private follow(): void {
    if (this.following) return;
    this.following = untracked(() =>
      effect(
        () => {
          this.camera.version();
          this.scene.world();
          untracked(() => this.writeSoon());
        },
        { injector: this.injector }
      )
    );
  }

  private writeSoon(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.write();
    });
  }

  private write(): void {
    const boxes = this.boxesNow();
    if (!boxes) return;
    const ranks = drawnRanks(boxes);
    const origin = this.camera.layout ?? { left: 0, top: 0 };
    const followed = this.eyes.followed()?.owner;
    const largest = this.camera.view?.perspectivePx ? FOLLOWING_LARGEST_SCALE : Infinity;
    const sizes = new Map<HTMLElement, { width: number; height: number }>();
    for (const [element, placed] of this.placed) {
      if (placed.anchor.place === 'face')
        sizes.set(element, { width: element.offsetWidth, height: element.offsetHeight });
    }
    for (const [element, placed] of this.placed) {
      const piece = placed.anchor.owner === followed ? undefined : boxes.get(placed.anchor.owner);
      const at = placed.anchor.at;
      const point = at ? this.surfaces.pageOf(at.surface, at.x, at.y, at.height) : null;
      const beside = at && placed.anchor.scaled ? this.surfaces.pageOf(at.surface, at.x + 1, at.y, at.height) : null;
      const scale = point && beside ? Math.min(largest, Math.hypot(beside.x - point.x, beside.y - point.y)) : null;
      const reach = placed.anchor.reach;
      const end = point && reach ? this.surfaces.pageOf(reach.surface, reach.x, reach.y, reach.height) : null;
      const lay = placed.anchor.lay;
      const style = !piece
        ? null
        : lay
          ? laidOn(lay, (x, y) => this.surfaces.pageOf(lay.surface, x, y, lay.height), piece)
          : at && reach
            ? point && end && laidBetween(point, end, piece)
            : at
              ? point && centredOn(point, piece, scale)
              : styleOf(
                  placed.anchor,
                  piece,
                  (ranks.get(placed.anchor.owner) ?? 0) + (placed.anchor.raised ? ranks.size : 0),
                  sizes.get(element),
                  origin,
                  largest
                );
      const written = style ? JSON.stringify(style) : '';
      if (written === placed.written) continue;
      placed.written = written;
      element.style.visibility = style ? '' : 'hidden';
      if (!style) continue;
      element.style.transform = style.transform;
      if (style.width !== null) element.style.width = style.width;
      if (style.height !== null) element.style.height = style.height;
      element.style.zIndex = style.zIndex;
    }
  }
}

/** The style an element is put with; a size of null leaves the element's own size alone. */
interface HudStyle {
  readonly transform: string;
  readonly width: string | null;
  readonly height: string | null;
  readonly zIndex: string;
}

function px(value: number): string {
  return `${Math.round(value * 100) / 100}px`;
}

/**
 * The style that puts an element's middle on a point of the page, within the root of a piece drawn
 * in these boxes, and draws it at a scale where one is given.
 */
function centredOn(point: { x: number; y: number }, piece: PiecePageBoxes, scale: number | null = null): HudStyle {
  const scaled = scale === null ? '' : ` scale(${Math.round(scale * 1000) / 1000})`;
  return {
    transform: `translate(${px(point.x - piece.whole.left)}, ${px(point.y - piece.whole.top)})${scaled} translate(-50%, -50%)`,
    width: null,
    height: null,
    zIndex: '',
  };
}

/**
 * The style that lays an element on a rectangle lying on a face, within the root of a piece drawn in
 * these boxes, its own box drawn onto where the rectangle's corners are drawn; none where a corner is
 * not drawn.
 */
function laidOn(
  lay: HudLay,
  pageOf: (x: number, y: number) => { x: number; y: number } | null,
  piece: PiecePageBoxes
): HudStyle | null {
  const corners = lay.corners.map((corner) => pageOf(corner.x, corner.y));
  if (corners.some((corner) => corner === null)) return null;
  const [a, b, c, d] = corners.map((corner) => ({ x: corner!.x - piece.whole.left, y: corner!.y - piece.whole.top }));
  const matrix = quadMatrix(lay.width, lay.depth, [a, b, c, d]);
  if (!matrix) return null;
  return {
    transform: `matrix3d(${matrix.map((value) => Math.round(value * 1e6) / 1e6).join(', ')})`,
    width: px(lay.width),
    height: px(lay.depth),
    zIndex: '',
  };
}

/**
 * The style that lays an element as a line from one point of the page to another, within the root of a
 * piece drawn in these boxes: its top left on the first, turned so that its height runs to the second.
 */
function laidBetween(from: { x: number; y: number }, to: { x: number; y: number }, piece: PiecePageBoxes): HudStyle {
  const turn = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI - 90;
  return {
    transform: `translate(${px(from.x - piece.whole.left)}, ${px(from.y - piece.whole.top)}) rotate(${Math.round(turn * 100) / 100}deg)`,
    width: null,
    height: px(Math.hypot(to.x - from.x, to.y - from.y)),
    zIndex: '',
  };
}

/**
 * The style that puts an element of a size against a piece drawn in these boxes, the root of a piece
 * within the screen that lies over the table from the origin given, on the page.
 */
function styleOf(
  anchor: HudAnchor,
  piece: PiecePageBoxes,
  rank: number,
  size: { width: number; height: number } | undefined,
  origin: { left: number; top: number },
  largest = Infinity
): HudStyle | null {
  const whole = piece.whole;
  if (anchor.part === undefined) {
    return {
      transform: `translate(${px(whole.left - origin.left)}, ${px(whole.top - origin.top)})`,
      width: px(whole.width),
      height: px(whole.height),
      zIndex: String(rank),
    };
  }
  const part = piece.parts.get(anchor.part);
  if (!part) return null;
  if (anchor.corner !== undefined) {
    const corner = part.corners?.[anchor.corner];
    return corner ? centredOn(corner, piece) : null;
  }
  if (anchor.edge !== undefined) {
    if (!part.corners) return null;
    const [from, to] = EDGE_CORNERS[anchor.edge].map((corner) => part.corners![corner]);
    return centredOn({ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, piece);
  }
  const within: PageBox = { ...part, left: part.left - whole.left, top: part.top - whole.top };
  const place = anchor.place ?? 'box';
  if (place === 'box') {
    return {
      transform: `translate(${px(within.left)}, ${px(within.top)})`,
      width: px(within.width),
      height: px(within.height),
      zIndex: '',
    };
  }
  if (place === 'face' || place === 'cover') {
    const laid = place === 'cover' ? part.size : size;
    if (!part.corners || !laid) return null;
    const [a, b, c, d] = part.corners.map((corner) => ({ x: corner.x - whole.left, y: corner.y - whole.top }));
    const matrix = quadMatrix(laid.width, laid.height, [a, b, c, d]);
    if (!matrix) return null;
    return {
      transform: `matrix3d(${matrix.map((value) => Math.round(value * 1e6) / 1e6).join(', ')})`,
      width: place === 'cover' ? px(laid.width) : null,
      height: place === 'cover' ? px(laid.height) : null,
      zIndex: '',
    };
  }
  const middle = within.left + within.width / 2;
  const edge = place === 'above' ? within.top : within.top + within.height;
  const shift = place === 'above' ? '-100%' : '0';
  return {
    transform: `translate(${px(middle)}, ${px(edge)}) scale(${Math.round(Math.min(largest, part.scale) * 1000) / 1000}) translate(-50%, ${shift})`,
    width: null,
    height: null,
    zIndex: '',
  };
}
