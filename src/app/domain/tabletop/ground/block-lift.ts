import { GridType } from '@axe/domain/tabletop/grid-type';
import { GROUND_HEIGHT_STEP } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundChunksOfRaster, type GroundRaster } from '@axe/domain/tabletop/ground/ground-raster';
import { groundLiftOfBlock, groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import type { MapPoint, MapRect } from '@axe/domain/tabletop/map-blocks';
import { blockOrigin } from '@axe/domain/tabletop/map-grid';

/** How much of its rectangle a block stands on, across and deep, in cells; all of it where left out. */
export interface BlockFoot {
  readonly w: number;
  readonly d: number;
}

/**
 * How far a block is lifted to stand at `level` over ground a generator has shaped: the table lets a
 * block down to the lowest of the ground under what it stands on, so it is lifted by as much as that
 * falls short of the level. Answered for a block's rectangle, shifted where the block is, and
 * standing on a part of the rectangle where its foot is narrower. Nothing where it needs no lift, and
 * nothing at all over flat ground.
 *
 * Every generator that stands a thing over ground it dug or raised asks here, so the table's rule of
 * letting a block down is answered in one place, by the reading the table itself makes of the ground.
 */
export function blockLiftsTo(
  level: number,
  ground: GroundRaster | null,
  gridType: GridType
): (rect: MapRect, shift?: MapPoint, foot?: BlockFoot) => number | undefined {
  if (!ground) return () => undefined;
  const surface = groundSurfaceOf(groundChunksOfRaster(ground));
  const stood = Math.round(level / GROUND_HEIGHT_STEP) * GROUND_HEIGHT_STEP;
  return (rect, shift, foot) => {
    const origin = blockOrigin(rect, { type: gridType, sizePx: 1 });
    const width = foot?.w ?? rect.w;
    const depth = foot?.d ?? rect.h;
    const location = {
      x: origin.x + (rect.w - width) / 2 + (shift?.x ?? 0),
      y: origin.y + (rect.h - depth) / 2 + (shift?.y ?? 0),
    };
    const lift = stood - groundLiftOfBlock(surface, 1, { location, width, depth });
    return lift > 0 ? lift : undefined;
  };
}
