import { DEFAULT_BLOCK_OPTIONS } from '@axe/domain/tabletop/dungeon/dungeon-blocks';
import { planDungeon } from '@axe/domain/tabletop/dungeon/dungeon-generator';
import { planField } from '@axe/domain/tabletop/field/field-generator';
import { GridType } from '@axe/domain/tabletop/grid-type';
import type { MapBlock } from '@axe/domain/tabletop/map-blocks';
import { blockCorner, cellCentre } from '@axe/domain/tabletop/map-grid';

const HEXES = [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL];

/** Whether the middle of a block, as it is put on the table, stands on the middle of one of its cells. */
function standsOnACell(block: MapBlock, gridType: GridType): boolean {
  const grid = { type: gridType, sizePx: 1 };
  const corner = blockCorner({ ...block, offset: undefined }, grid);
  const middle = { x: corner.x + block.rect.w / 2, y: corner.y + block.rect.h / 2 };
  for (let dy = 0; dy < block.rect.h; dy++) {
    for (let dx = 0; dx < block.rect.w; dx++) {
      const centre = cellCentre({ x: block.rect.x + dx, y: block.rect.y + dy }, grid);
      if (Math.hypot(centre.x - middle.x, centre.y - middle.y) < 1e-9) return true;
    }
  }
  return false;
}

describe('a block of several cells a generator lays on a board of hexes', () => {
  it('stands its middle on the middle of one of its cells, whatever laid it', () => {
    for (const gridType of HEXES) {
      const plans = [
        [
          'castle town',
          planField({ atmosphere: 'castleTown', size: 40, density: 50, seed: 7, gridType, models: true }),
        ],
        ['village', planField({ atmosphere: 'village', size: 40, density: 50, seed: 3, gridType, models: true })],
        ['woodland', planField({ atmosphere: 'woodland', size: 30, density: 80, seed: 5, gridType })],
        [
          'wizard tower',
          planDungeon({ atmosphere: 'wizardTower', roomCount: 8, seed: 11, gridType } as never, {
            ...DEFAULT_BLOCK_OPTIONS,
            models: true,
          }),
        ],
      ] as const;
      for (const [name, plan] of plans) {
        const several = plan.blocks.blocks.filter((block) => block.rect.w > 1 || block.rect.h > 1);
        expect(several.length, `${name} ${gridType}`).toBeGreaterThan(0);
        for (const block of several) {
          expect(
            standsOnACell(block, gridType),
            `${name} ${gridType} ${block.thing} at ${block.rect.x},${block.rect.y}`
          ).toBe(true);
        }
      }
    }
  });
});
