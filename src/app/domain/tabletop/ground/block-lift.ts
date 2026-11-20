import { GridType } from '@axe/domain/tabletop/grid-type';
import { GROUND_HEIGHT_STEP } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundChunksOfRaster, type GroundRaster } from '@axe/domain/tabletop/ground/ground-raster';
import { groundLiftOfBlock, groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import type { MapBlock } from '@axe/domain/tabletop/map-blocks';
import { blockCorner } from '@axe/domain/tabletop/map-grid';

/** What of a block says where it stands: its rectangle, where it is put over it, and how much of it it stands on. */
export type BlockStand = Pick<MapBlock, 'rect' | 'offset' | 'standsOn' | 'footprint'>;

/**
 * How far a block is lifted to stand at `level` over ground a generator has shaped: the table lets a
 * block down to the lowest of the ground under what it stands on, so it is lifted by as much as that
 * falls short of the level. Answered for a block where it is put (see `blockCorner`), standing on a
 * part of its rectangle where its footprint is narrower. Nothing where it needs no lift, and
 * nothing at all over flat ground.
 *
 * Every generator that stands a thing over ground it dug or raised asks here, so the table's rule of
 * letting a block down is answered in one place, by the reading the table itself makes of the ground.
 */
export function blockLiftsTo(
  level: number,
  ground: GroundRaster | null,
  gridType: GridType
): (block: BlockStand) => number | undefined {
  if (!ground) return () => undefined;
  const surface = groundSurfaceOf(groundChunksOfRaster(ground));
  const stood = Math.round(level / GROUND_HEIGHT_STEP) * GROUND_HEIGHT_STEP;
  return (block) => {
    const { rect } = block;
    const corner = blockCorner(block, { type: gridType, sizePx: 1 });
    const width = block.footprint?.w ?? rect.w;
    const depth = block.footprint?.d ?? rect.h;
    const location = { x: corner.x + (rect.w - width) / 2, y: corner.y + (rect.h - depth) / 2 };
    const lift = stood - groundLiftOfBlock(surface, 1, { location, width, depth });
    return lift > 0 ? lift : undefined;
  };
}
