import { HexFlowerParams } from '@axe/domain/tabletop/hex-flower-geometry';
import { ShadeStop } from '@axe/domain/tabletop/terrain-batch/batch-shade';
import { CAP_BLEED, SquareCap } from '@axe/domain/tabletop/terrain-batch/square-caps';
import { SquareWall } from '@axe/domain/tabletop/terrain-batch/square-walls';
import { hexFaceMidpointOf } from '@axe/domain/tabletop/terrain-occlusion/occlusion-shape';
import { shadeAlongGradient } from '@axe/ui/tabletop/shaded-background';

/** A surface's background, layer by layer: the shade over the picture. */
export interface BatchBackground {
  readonly image: string;
  readonly size: string;
  readonly position: string;
  readonly repeat: string;
}

/** Where a wall stands up from, and the turn that stands it up. */
export interface WallPlacement {
  readonly transform: string;
  readonly origin: string;
}

/**
 * How a wall is stood up on the table.
 *
 * The same turns a block drawn alone gives the face on that side, with the face moved from the
 * corner of the block to where it starts, so it stands exactly where it stood and its picture is
 * laid from the same end.
 */
export function wallPlacement(wall: SquareWall): WallPlacement {
  const { startX: x, startY: y, lengthPx: length, heightPx: height } = wall;
  switch (wall.side) {
    case 'north':
      return {
        transform: `translate3d(${x}px, ${y}px, 0) translateY(-100%) rotateX(90deg) rotateZ(180deg) scaleX(-1)`,
        origin: '50% 100%',
      };
    case 'south':
      return { transform: `translate3d(${x}px, ${y - height}px, 0) rotateX(-90deg)`, origin: '50% 100%' };
    case 'west':
      return {
        transform: `translate3d(${x}px, ${y - length}px, 0) rotateZ(90deg) rotateX(-90deg) scaleX(-1) translateX(-100%) translateY(-100%)`,
        origin: '0 0',
      };
    default:
      return {
        transform: `translate3d(${x - length}px, ${y - length}px, 0) rotateZ(-90deg) rotateX(-90deg) translateY(-100%)`,
        origin: '100% 0',
      };
  }
}

/**
 * A cap's background: a gradient across each row of cells, over its picture laid a cell to a
 * tile from the corner of the board.
 */
export function capBackground(
  cap: SquareCap,
  rows: readonly (readonly ShadeStop[])[],
  url: string,
  gridSize: number,
  shade: string
): BatchBackground {
  const layers: { image: string; size: string; position: string }[] = [];
  const flat = rows.every((row) => row.length === 1 && row[0].value === rows[0][0].value);
  if (flat) {
    const image = shadeAlongGradient(rows[0] ?? [], shade);
    if (image) layers.push({ image, size: '100% 100%', position: '0 0' });
  } else {
    rows.forEach((row, index) => {
      const image = shadeAlongGradient(row, shade);
      if (!image) return;
      // The first and last rows reach out over the bleed, so no unshaded edge is left there.
      const top = index === 0 ? 0 : CAP_BLEED + index * gridSize;
      const bottom = index === rows.length - 1 ? cap.height : CAP_BLEED + (index + 1) * gridSize;
      layers.push({ image, size: `${cap.width}px ${bottom - top}px`, position: `0 ${top}px` });
    });
  }
  return {
    image: [...layers.map((layer) => layer.image), `url(${url})`].join(', '),
    size: [...layers.map((layer) => layer.size), `${gridSize}px ${gridSize}px`].join(', '),
    position: [...layers.map((layer) => layer.position), `${CAP_BLEED}px ${CAP_BLEED}px`].join(', '),
    repeat: [...layers.map(() => 'no-repeat'), 'repeat'].join(', '),
  };
}

/**
 * A wall's background: a gradient along it, over its picture laid from its start.
 *
 * A tiled picture is a cell to a tile. A stretched one only ever comes from blocks a cell across,
 * whose faces are a cell long, so it is laid a cell long and the height of the wall.
 */
export function wallBackground(
  wall: SquareWall,
  stops: readonly ShadeStop[],
  url: string,
  gridSize: number,
  tiled: boolean,
  shade: string
): BatchBackground {
  const image = shadeAlongGradient(stops, shade);
  const tile = tiled ? `${gridSize}px ${gridSize}px` : `${gridSize}px ${wall.heightPx}px`;
  return {
    image: image ? `${image}, url(${url})` : `url(${url})`,
    size: image ? `100% 100%, ${tile}` : tile,
    position: image ? '0 0, 0 0' : '0 0',
    repeat: image ? 'no-repeat, repeat' : 'repeat',
  };
}

/** How far the middle of a wall may lie from the middle a hidden side is named by, and still be that side, in pixels. */
const SIDE_MATCH_PX = 0.5;

/**
 * Which walls of a hex block the blocks around it hide, in the order its walls are laid out.
 *
 * The outline the walls stand on and the sides the neighbours hide are worked out apart, so a wall
 * is matched to a hidden side by where their middles lie. Neighbouring walls' middles are half a cell
 * apart, so a match within half a pixel is never the wrong wall.
 */
export function hiddenHexWallsOf(params: HexFlowerParams, hidden: ReadonlySet<string>): boolean[] {
  const middles = [...hidden].map(hexFaceMidpointOf).filter((middle) => middle !== null);
  const { outline } = params;
  return outline.map((from, i) => {
    const to = outline[(i + 1) % outline.length];
    const x = (from.x + to.x) / 2;
    const y = (from.y + to.y) / 2;
    return middles.some((middle) => Math.abs(middle.x - x) <= SIDE_MATCH_PX && Math.abs(middle.y - y) <= SIDE_MATCH_PX);
  });
}
