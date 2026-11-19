import { readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';

import { areasOver, watersInLots, watersOver } from '@axe/domain/tabletop/field/water-areas';
import { GridType } from '@axe/domain/tabletop/grid-type';
import type { MapAmbience, MapRect } from '@axe/domain/tabletop/map-blocks';

const WIDTH = 5;
const HEIGHT = 4;
const POND = { surface: 0, color: '#3399cc', turbidity: 0.2, dirt: 0, leaves: 0, ice: 0 };
const GRIDS = [GridType.SQUARE, GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL];

function maskOf(cells: readonly (readonly [number, number])[]): Uint8Array {
  const mask = new Uint8Array(WIDTH * HEIGHT);
  for (const [x, y] of cells) mask[y * WIDTH + x] = 1;
  return mask;
}

function cellsOf(rects: readonly MapRect[]): number[] {
  const cells: number[] = [];
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) cells.push(y * WIDTH + x);
    }
  }
  return cells.sort((a, b) => a - b);
}

const BEND: readonly (readonly [number, number])[] = [
  [1, 0],
  [1, 1],
  [2, 1],
  [3, 1],
  [3, 2],
];

describe('the water a generator lays', () => {
  it.each(GRIDS)('covers the cells of a mask and no others, no cell twice, on grid %s', (gridType) => {
    const waters = watersOver(maskOf(BEND), WIDTH, HEIGHT, gridType, POND);

    expect(cellsOf(waters.map((water) => water.rect))).toEqual(
      BEND.map(([x, y]) => y * WIDTH + x).sort((a, b) => a - b)
    );
    expect(waters.map((water) => water.rect)).toEqual(areasOver(maskOf(BEND), WIDTH, HEIGHT, gridType));
  });

  it('lays every area as the same water, as thick as the settings of water lay a pond', () => {
    const waters = watersOver(maskOf(BEND), WIDTH, HEIGHT, GridType.SQUARE, POND);

    expect(waters.length).toBeGreaterThan(1);
    for (const water of waters) {
      expect(water).toMatchObject({ kind: 'water', name: 'water', density: 0.6, water: POND });
    }
  });

  it.each(GRIDS)('lays cells that differ in lots that never overlap, on grid %s', (gridType) => {
    const cells = BEND.map(([x, y], at) => ({ index: y * WIDTH + x, lot: at < 2 ? 'south' : 'east' }));

    const waters = watersInLots(cells, WIDTH, HEIGHT, gridType, (lot) => ({
      ...POND,
      flowDirection: lot === 'south' ? 180 : 90,
    }));

    expect(cellsOf(waters.map((water) => water.rect))).toEqual(cells.map((cell) => cell.index).sort((a, b) => a - b));
    const south = waters.filter((water) => water.water?.flowDirection === 180).map((water) => water.rect);
    expect(cellsOf(south)).toEqual([1, WIDTH + 1]);
  });

  it('lays the lots in the order their first cells lie on the board, however the cells are handed over', () => {
    const cells = BEND.map(([x, y], at) => ({ index: y * WIDTH + x, lot: at < 2 ? 'south' : 'east' }));
    const lotsOf = (waters: MapAmbience[]) => waters.map((water) => water.water?.flowDirection);
    const waterOf = (lot: string) => ({ ...POND, flowDirection: lot === 'south' ? 180 : 90 });

    const forwards = watersInLots(cells, WIDTH, HEIGHT, GridType.SQUARE, waterOf);
    const backwards = watersInLots([...cells].reverse(), WIDTH, HEIGHT, GridType.SQUARE, waterOf);

    expect(backwards).toEqual(forwards);
    expect(lotsOf(forwards)[0]).toBe(180);
    expect(lotsOf(forwards).at(-1)).toBe(90);
  });

  it('is laid by nothing else: every generator lays its water through here', () => {
    const sourcesUnder = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = posix.join(dir, entry.name);
        if (entry.isDirectory()) return sourcesUnder(path);
        return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
      });

    const laying = sourcesUnder('src/app/domain/tabletop').filter((file) =>
      /kind: 'water'/.test(readFileSync(file, 'utf-8'))
    );

    expect(laying).toEqual(['src/app/domain/tabletop/field/water-areas.ts']);
  });
});
