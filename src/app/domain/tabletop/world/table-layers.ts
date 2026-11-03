import type { GameTable } from '@axe/domain/tabletop/game-table';

/**
 * A picture drifting past the board, as the scene lays it: under the board, where it shows through
 * the clear parts of the board's own picture, or over it, under everything standing on it. The
 * picture is laid edge to edge from the board's corner at the north-west, at `scale` times the size
 * it was made, held to the board's size, and drifts at `speedX` and `speedY` pixels a second.
 */
export interface TableWorldLayer {
  readonly id: string;
  readonly pictureUrl: string;
  readonly over: boolean;
  readonly scale: number;
  readonly speedX: number;
  readonly speedY: number;
  readonly opacity: number;
}

/**
 * The layers a table lays under and over its board, back to front, each run apart: those turned off,
 * those with nothing to show and those behind the whole table are left out. Where things on the
 * table may not move, as for a reader who asks for less motion, none of them drifts.
 */
export function tableLayersOf(
  table: GameTable | null | undefined,
  pictureOf: (identifier: string) => string,
  moving: boolean
): TableWorldLayer[] {
  if (!table) return [];
  return table.backgroundLayers
    .filter((layer) => !layer.placedBackdrop && layer.enabled && layer.opacity > 0)
    .map((layer) => ({
      id: layer.identifier,
      pictureUrl: pictureOf(layer.imageIdentifier),
      over: layer.placedOver,
      scale: layer.scale,
      speedX: moving && Number.isFinite(layer.speedX) ? layer.speedX : 0,
      speedY: moving && Number.isFinite(layer.speedY) ? layer.speedY : 0,
      opacity: Math.min(1, layer.opacity),
    }))
    .filter((layer) => layer.pictureUrl !== '')
    .sort((a, b) => Number(a.over) - Number(b.over));
}

/**
 * A picture a table lays behind everything, as a range of hills on the horizon, as a scene with a sky
 * stands it round the board: how much it follows the camera, from 0 for the furthest off to 1 for the
 * nearest, and how high it stands, from 0 at the horizon up, drifting across at `speedX` pixels a second.
 */
export interface TableWorldBackdrop {
  readonly id: string;
  readonly pictureUrl: string;
  readonly scale: number;
  readonly follow: number;
  readonly height: number;
  readonly speedX: number;
  readonly opacity: number;
}

/**
 * The pictures a table lays behind everything, back to front: those turned off, those seen through
 * entirely and those with nothing to show are left out. Where things may not move none of them drifts.
 */
export function tableBackdropsOf(
  table: GameTable | null | undefined,
  pictureOf: (identifier: string) => string,
  moving: boolean
): TableWorldBackdrop[] {
  if (!table) return [];
  return table.backgroundLayers
    .filter((layer) => layer.placedBackdrop && layer.enabled && layer.opacity > 0)
    .map((layer) => ({
      id: layer.identifier,
      pictureUrl: pictureOf(layer.imageIdentifier),
      scale: layer.scale,
      follow: layer.follow,
      height: layer.height,
      speedX: moving && Number.isFinite(layer.speedX) ? layer.speedX : 0,
      opacity: Math.min(1, layer.opacity),
    }))
    .filter((layer) => layer.pictureUrl !== '');
}
