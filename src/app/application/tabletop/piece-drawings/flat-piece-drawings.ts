import type { DrawnPlace, PiecePictures } from '@axe/application/tabletop/piece-drawings/piece-drawing';
import type { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import type { RangeArea } from '@axe/domain/tabletop/range';
import { maskSprites, rangeSprites } from '@axe/domain/tabletop/world/flat-piece-sprites';
import type { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

/** A map mask drawn at a place from the picture the page takes of it cut to its open cells. */
export function drawMask(
  mask: GameTableMask,
  place: DrawnPlace,
  gridSize: number,
  pictures: PiecePictures
): TableWorldSprite[] {
  return maskSprites({
    id: mask.identifier,
    ...place,
    altitudePx: mask.altitude * gridSize,
    picture: pictures.pageOf(mask.identifier),
  });
}

/**
 * A range drawn at a place from the picture the page takes of its cells, lying over the raised ground
 * where it lies on the floor itself.
 */
export function drawRange(
  range: RangeArea,
  place: DrawnPlace,
  gridSize: number,
  pictures: PiecePictures
): TableWorldSprite[] {
  return rangeSprites({
    id: range.identifier,
    ...place,
    altitudePx: range.altitude * gridSize,
    picture: pictures.pageOf(range.identifier),
    ...(place.onFloor && Math.abs(place.placedZ) < 1 ? { overGroundPx: range.altitude * gridSize } : {}),
  });
}
