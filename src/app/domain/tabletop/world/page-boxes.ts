import type { Matrix3D } from '@axe/core/transform/matrix-3d';
import { pageOfTablePoint, TablePoint } from '@axe/domain/tabletop/camera/table-camera';
import { PickTarget } from '@axe/domain/tabletop/pick/pick-index';
import { lyingPlaceOfOwners } from '@axe/domain/tabletop/world/lying-order';
import { TableWorldCoin } from '@axe/domain/tabletop/world/table-coins';
import { EyeAxes, pointOnFace, spriteBoxCorners, TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

/** The part a coin is drawn as, among the parts a piece's boxes are named by. */
export const COIN_PART = 'coin';

/** How many points round a coin's rim its box is drawn round. */
const RIM_POINTS = 32;

/** A box on the page, in page pixels from its top left corner. */
export interface PageBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** A point of the page, in page pixels. */
export interface PagePoint {
  readonly x: number;
  readonly y: number;
}

/** A part of a piece as it is drawn on the page. */
export interface PagePart extends PageBox {
  /** How many page pixels a table pixel across its middle is drawn as, facing the eye. */
  readonly scale: number;
  /**
   * For a part drawn with one sprite, where its corners are drawn, round from its top left as a
   * picture on it is read.
   */
  readonly corners?: readonly [PagePoint, PagePoint, PagePoint, PagePoint];
  /** For a part drawn with one sprite, how large it is on the table, in table pixels across and down. */
  readonly size?: { readonly width: number; readonly height: number };
}

/** A piece as it is drawn on the page: the box round all of it, and its parts by name. */
export interface PiecePageBoxes {
  readonly whole: PageBox;
  readonly parts: ReadonlyMap<string, PagePart>;
  /** How near the eye its nearest point is drawn: of two pieces, the nearer is drawn over the other. */
  readonly nearness: number;
  /**
   * For a piece drawn only with sprites lying flat on a face, as a card, the place of the last of them
   * drawn in the order the canvas draws such sprites in, one over another.
   */
  readonly lyingPlace?: number;
  /**
   * For a piece drawn only with sprites lying flat on the floor, on the ground, as a range or a card
   * on the floor: that it lies on the ground, under everything standing on the floor, however far it
   * reaches.
   */
  readonly onGround?: true;
}

/** How far off the ground under it a sprite lying flat may lie and still lie on the ground, in table pixels. */
const ON_GROUND_PX = 4;

/**
 * Whether a sprite lies flat on the ground: lying on a face that is level, as the floor is, within a
 * little of the ground under its middle, or following the raised ground.
 */
function liesOnGround(sprite: TableWorldSprite, groundAt?: (x: number, y: number) => number): boolean {
  if (sprite.order === undefined || sprite.facing === 'eye') return false;
  if (sprite.drapes) return true;
  if (Math.abs(sprite.facing.across.z) > 0.5 || Math.abs(sprite.facing.down.z) > 0.5) return false;
  const ground = groundAt?.(sprite.centre.x, sprite.centre.y) ?? 0;
  return Math.abs(sprite.centre.z - ground) <= ON_GROUND_PX;
}

/** The name of the part of a piece a sprite draws, as its identifier names it after its `#`. */
export function partOf(sprite: TableWorldSprite): string {
  return sprite.id.slice(sprite.id.lastIndexOf('#') + 1);
}

function boxRound(points: readonly { x: number; y: number }[]): PageBox {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const point of points) {
    left = Math.min(left, point.x);
    top = Math.min(top, point.y);
    right = Math.max(right, point.x);
    bottom = Math.max(bottom, point.y);
  }
  return { left, top, width: right - left, height: bottom - top };
}

function nearnessOf(scene: Matrix3D, point: TablePoint): number {
  return point.x * scene.m13 + point.y * scene.m23 + point.z * scene.m33 + scene.m43;
}

/** How many page pixels a table pixel at a point, running along the eye's right, is drawn as. */
function scaleAt(scene: Matrix3D, eye: EyeAxes, point: TablePoint): number {
  const from = pageOfTablePoint(scene, point.x, point.y, point.z);
  const to = pageOfTablePoint(scene, point.x + eye.right.x, point.y + eye.right.y, point.z + eye.right.z);
  return Math.hypot(to.x - from.x, to.y - from.y);
}

/** The points a part of a piece is drawn round, gathered from its sprites, and its size where it has one sprite. */
interface GatheredPart {
  readonly points: TablePoint[];
  readonly middle: TablePoint;
  sprites: number;
  readonly size: { readonly width: number; readonly height: number } | null;
}

/** How many points along each side of its box a sprite lying over the raised ground is boxed round by. */
const DRAPED_SIDE_POINTS = 16;

/**
 * The corners and the rim of a sprite lying over the raised ground, as `groundAt` tells how high the
 * ground stands at a point: the corners first, in the order its own corners go round.
 */
function drapedPoints(
  sprite: TableWorldSprite,
  eye: EyeAxes,
  liftPx: number,
  groundAt: (x: number, y: number) => number
): TablePoint[] {
  const over = (x: number, y: number): TablePoint => ({ x, y, z: groundAt(x, y) + liftPx });
  const corners = spriteBoxCorners(sprite, eye).map((corner) => over(corner.x, corner.y));
  const rim: TablePoint[] = [];
  for (let side = 0; side < 4; side++) {
    const from = corners[side];
    const to = corners[(side + 1) % 4];
    for (let i = 1; i < DRAPED_SIDE_POINTS; i++) {
      const share = i / DRAPED_SIDE_POINTS;
      rim.push(over(from.x + (to.x - from.x) * share, from.y + (to.y - from.y) * share));
    }
  }
  return [...corners, ...rim];
}

/**
 * Where the pieces drawn on the table show on the page, through a matrix from `tableSceneMatrix`: for
 * each piece, the box round all of it and a box round each of its parts, a part made of more than one
 * sprite boxed whole. A coin is boxed round its rims, as the part `coin`. A sprite following the
 * raised ground is boxed round where it lies over it, as `groundAt` tells how high the ground stands
 * at a point, where given.
 */
export function piecePageBoxes(
  sprites: readonly TableWorldSprite[],
  coins: readonly TableWorldCoin[],
  scene: Matrix3D,
  eye: EyeAxes,
  groundAt?: (x: number, y: number) => number
): Map<string, PiecePageBoxes> {
  const corners = new Map<string, Map<string, GatheredPart>>();
  const add = (
    owner: string,
    part: string,
    points: TablePoint[],
    middle: TablePoint,
    sprites: number,
    size: GatheredPart['size'] = null
  ) => {
    const parts = corners.get(owner) ?? new Map<string, GatheredPart>();
    const kept = parts.get(part);
    if (kept) {
      kept.points.push(...points);
      kept.sprites += sprites;
    } else parts.set(part, { points: [...points], middle, sprites, size });
    corners.set(owner, parts);
  };
  const places = lyingPlaceOfOwners(sprites);
  const standing = new Set<string>();
  const offGround = new Set<string>();
  for (const sprite of sprites) {
    if (sprite.order === undefined) standing.add(sprite.owner);
    if (!liesOnGround(sprite, groundAt)) offGround.add(sprite.owner);
    const corners =
      sprite.drapes && groundAt
        ? drapedPoints(sprite, eye, sprite.drapes.liftPx, groundAt)
        : spriteBoxCorners(sprite, eye);
    const size = sprite.box
      ? { width: sprite.box.width, height: sprite.box.height }
      : { width: sprite.widthPx, height: sprite.heightPx };
    add(sprite.owner, partOf(sprite), corners, sprite.box ? middleOf(corners) : sprite.centre, 1, size);
  }
  for (const coin of coins) {
    const rim: TablePoint[] = [];
    for (let i = 0; i < RIM_POINTS; i++) {
      const turn = (i / RIM_POINTS) * Math.PI * 2;
      const across = coin.x + Math.cos(turn) * coin.radiusPx;
      const down = coin.y + Math.sin(turn) * coin.radiusPx;
      rim.push(
        pointOnFace(coin.face, across, down, coin.base),
        pointOnFace(coin.face, across, down, coin.base + coin.thicknessPx)
      );
    }
    add(coin.id, COIN_PART, rim, pointOnFace(coin.face, coin.x, coin.y, coin.base + coin.thicknessPx / 2), 0);
  }
  const boxes = new Map<string, PiecePageBoxes>();
  for (const [owner, parts] of corners) {
    const onPage: { x: number; y: number }[] = [];
    let nearness = -Infinity;
    const pageParts = new Map<string, PagePart>();
    for (const [part, { points, middle, sprites, size }] of parts) {
      const projected = points.map((point) => pageOfTablePoint(scene, point.x, point.y, point.z));
      onPage.push(...projected);
      for (const point of points) nearness = Math.max(nearness, nearnessOf(scene, point));
      const box = { ...boxRound(projected), scale: scaleAt(scene, eye, middle) };
      if (sprites !== 1) pageParts.set(part, box);
      else {
        const [a, b, c, d] = projected.map((point) => ({ x: point.x, y: point.y }));
        pageParts.set(part, { ...box, corners: [a, b, c, d], ...(size ? { size } : {}) });
      }
    }
    const lyingPlace = standing.has(owner) ? undefined : places.get(owner);
    boxes.set(owner, {
      whole: boxRound(onPage),
      parts: pageParts,
      nearness,
      ...(lyingPlace === undefined ? {} : { lyingPlace }),
      ...(lyingPlace === undefined || offGround.has(owner) ? {} : { onGround: true }),
    });
  }
  return boxes;
}

/**
 * The order the pieces are drawn over each other in on the page, from 1 for the one under all the
 * rest. Of two pieces, the nearer the eye is drawn over the other; but a piece lying on the ground,
 * as a range or a card on the floor, is drawn under every piece that does not, however near the eye
 * it reaches, as nothing standing on the floor is seen through the ground. Pieces drawn only lying
 * flat, as cards on the table, are drawn over each other in the order the canvas draws them in,
 * wherever they overlap and however near the eye the rest of them reaches, and are stacked so among
 * the places their nearness gives them, those on the ground among their own.
 */
export function drawnRanks(boxes: ReadonlyMap<string, PiecePageBoxes>): Map<string, number> {
  const order = [...boxes].sort(([, a], [, b]) => Number(!a.onGround) - Number(!b.onGround) || a.nearness - b.nearness);
  const ranks = new Map(order.map(([owner], rank) => [owner, rank + 1]));
  for (const onGround of [true, false]) {
    const lying = order.filter(([, piece]) => piece.lyingPlace !== undefined && !!piece.onGround === onGround);
    const slots = lying.map(([owner]) => ranks.get(owner)!);
    const byPlace = [...lying].sort(([, a], [, b]) => a.lyingPlace! - b.lyingPlace!);
    byPlace.forEach(([owner], index) => ranks.set(owner, slots[index]));
  }
  return ranks;
}

/** The part a block's top is boxed as, among the parts its boxes are named by. */
export const TOP_PART = 'top';

/**
 * Where the blocks are drawn on the page, from the shapes picking finds them by: for each, the box
 * round all of it, and its top as the part `top`, with its corners where its top has four.
 */
export function blockPageBoxes(
  targets: readonly PickTarget[],
  scene: Matrix3D,
  eye: EyeAxes
): Map<string, PiecePageBoxes> {
  const boxes = new Map<string, PiecePageBoxes>();
  for (const target of targets) {
    const all: TablePoint[] = [];
    const tops: TablePoint[] = [];
    for (const shape of target.shapes) {
      const onFace = shape.kind === 'on-face' ? shape : null;
      const prism = onFace ? onFace.shape : shape;
      if (prism.kind !== 'prism') continue;
      const at = (x: number, y: number, z: number): TablePoint =>
        onFace ? pointOnFace(onFace.frame, x, y, z) : { x, y, z };
      for (const corner of prism.outline) {
        const top = at(corner.x, corner.y, prism.roofAt ? prism.roofAt(corner.x, corner.y) : prism.top);
        tops.push(top);
        all.push(top, at(corner.x, corner.y, prism.base));
      }
    }
    if (!tops.length) continue;
    const onPage = (points: TablePoint[]) => points.map((point) => pageOfTablePoint(scene, point.x, point.y, point.z));
    const topOnPage = onPage(tops);
    const middle = {
      x: tops.reduce((sum, point) => sum + point.x, 0) / tops.length,
      y: tops.reduce((sum, point) => sum + point.y, 0) / tops.length,
      z: tops.reduce((sum, point) => sum + point.z, 0) / tops.length,
    };
    const top: PagePart = { ...boxRound(topOnPage), scale: scaleAt(scene, eye, middle) };
    const [a, b, c, d] = topOnPage.map((point) => ({ x: point.x, y: point.y }));
    boxes.set(target.id, {
      whole: boxRound(onPage(all)),
      parts: new Map([[TOP_PART, tops.length === 4 ? { ...top, corners: [a, b, c, d] } : top]]),
      nearness: Math.max(...all.map((point) => nearnessOf(scene, point))),
    });
  }
  return boxes;
}

/**
 * The CSS `matrix3d` that draws a box of an element, of the size given and with its origin at its
 * top left, onto four corners of the page, round from its top left: the perspective of a flat thing
 * drawn in 3D, so the element lies exactly where that thing is drawn.
 */
export function quadMatrix(
  width: number,
  height: number,
  corners: readonly [PagePoint, PagePoint, PagePoint, PagePoint]
): number[] | null {
  if (!(width > 0) || !(height > 0)) return null;
  const [p0, p1, p2, p3] = corners;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-9) return null;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const c = p0.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  const f = p0.y;
  return [a / width, d / width, 0, g / width, b / height, e / height, 0, h / height, 0, 0, 1, 0, c, f, 0, 1];
}

/** The middle of four corners. */
function middleOf(corners: readonly TablePoint[]): TablePoint {
  const sum = corners.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y, z: total.z + point.z }), {
    x: 0,
    y: 0,
    z: 0,
  });
  return { x: sum.x / corners.length, y: sum.y / corners.length, z: sum.z / corners.length };
}
