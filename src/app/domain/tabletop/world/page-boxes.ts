import type { Matrix3D } from '@axe/core/transform/matrix-3d';
import { pageOfTablePoint, TablePoint } from '@axe/domain/tabletop/camera/table-camera';
import { TableWorldCoin } from '@axe/domain/tabletop/world/table-coins';
import { EyeAxes, pointOnFace, spriteCorners, TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

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

/** A part of a piece as it is drawn on the page. */
export interface PagePart extends PageBox {
  /** How many page pixels a table pixel across its middle is drawn as, facing the eye. */
  readonly scale: number;
}

/** A piece as it is drawn on the page: the box round all of it, and its parts by name. */
export interface PiecePageBoxes {
  readonly whole: PageBox;
  readonly parts: ReadonlyMap<string, PagePart>;
  /** How near the eye its nearest point is drawn: of two pieces, the nearer is drawn over the other. */
  readonly nearness: number;
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

/**
 * Where the pieces drawn on the table show on the page, through a matrix from `tableSceneMatrix`: for
 * each piece, the box round all of it and a box round each of its parts, a part made of more than one
 * sprite boxed whole. A coin is boxed round its rims, as the part `coin`.
 */
export function piecePageBoxes(
  sprites: readonly TableWorldSprite[],
  coins: readonly TableWorldCoin[],
  scene: Matrix3D,
  eye: EyeAxes
): Map<string, PiecePageBoxes> {
  const corners = new Map<string, Map<string, { points: TablePoint[]; middle: TablePoint }>>();
  const add = (owner: string, part: string, points: TablePoint[], middle: TablePoint) => {
    const parts = corners.get(owner) ?? new Map<string, { points: TablePoint[]; middle: TablePoint }>();
    const kept = parts.get(part);
    if (kept) kept.points.push(...points);
    else parts.set(part, { points: [...points], middle });
    corners.set(owner, parts);
  };
  for (const sprite of sprites) add(sprite.owner, partOf(sprite), spriteCorners(sprite, eye), sprite.centre);
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
    add(coin.id, COIN_PART, rim, pointOnFace(coin.face, coin.x, coin.y, coin.base + coin.thicknessPx / 2));
  }
  const boxes = new Map<string, PiecePageBoxes>();
  for (const [owner, parts] of corners) {
    const onPage: { x: number; y: number }[] = [];
    let nearness = -Infinity;
    const pageParts = new Map<string, PagePart>();
    for (const [part, { points, middle }] of parts) {
      const projected = points.map((point) => pageOfTablePoint(scene, point.x, point.y, point.z));
      onPage.push(...projected);
      for (const point of points) nearness = Math.max(nearness, nearnessOf(scene, point));
      pageParts.set(part, { ...boxRound(projected), scale: scaleAt(scene, eye, middle) });
    }
    boxes.set(owner, { whole: boxRound(onPage), parts: pageParts, nearness });
  }
  return boxes;
}
