import { SETTLEMENT_ZONES, SettlementLayout } from '@axe/domain/tabletop/field/settlement-layout';
import {
  cellDistancesFrom,
  settlementMiddleOf,
  settlementSiteOf,
  terraceSettlement,
} from '@axe/domain/tabletop/field/settlement-terrace';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { GroundRaster } from '@axe/domain/tabletop/ground/ground-raster';

const WIDTH = 12;
const HEIGHT = 8;

/** A village of one yard with a house on it, a fence post, a crop and a well, on an otherwise empty board. */
function village(): SettlementLayout {
  const zones = new Uint8Array(WIDTH * HEIGHT);
  const walls = new Uint8Array(WIDTH * HEIGHT);
  const taken = new Uint8Array(WIDTH * HEIGHT);
  zones[3 * WIDTH + 3] = SETTLEMENT_ZONES.yard;
  taken[3 * WIDTH + 4] = 1;
  walls[4 * WIDTH + 3] = 1;
  return {
    kind: 'village',
    zones,
    walls,
    doors: [],
    crops: [{ rect: { x: 5, y: 3, w: 2, h: 1 }, crop: 'wheat' }],
    things: [{ x: 3, y: 5, thing: 'well' }],
    fires: [],
    taken,
    ring: null,
  };
}

/** A raster a sample high per cell across the board, so every sample's height says where it is. */
function slopedRaster(): GroundRaster {
  const columns = WIDTH * 2 + 1;
  const rows = HEIGHT * 2 + 1;
  const heights = new Float32Array(columns * rows);
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) heights[row * columns + column] = column / 2;
  return { columns, rows, heights };
}

function heightAtCell(raster: GroundRaster, x: number, y: number): number {
  return raster.heights[(y * 2 + 1) * raster.columns + x * 2 + 1];
}

describe('settlementSiteOf', () => {
  it('takes in every cell the settlement laid something on', () => {
    const site = settlementSiteOf(village(), WIDTH, HEIGHT);
    const cells = [...site].flatMap((on, index) => (on ? [[index % WIDTH, Math.floor(index / WIDTH)]] : []));

    expect(cells).toEqual([
      [3, 3],
      [4, 3],
      [5, 3],
      [6, 3],
      [3, 4],
      [3, 5],
    ]);
  });
});

describe('cellDistancesFrom', () => {
  it('counts a step to any neighbour as one, from the nearest cell of the site', () => {
    const site = new Uint8Array(WIDTH * HEIGHT);
    site[2 * WIDTH + 2] = 1;

    const distance = cellDistancesFrom(site, WIDTH, HEIGHT);

    expect(distance[2 * WIDTH + 2]).toBe(0);
    expect(distance[3 * WIDTH + 3]).toBe(1);
    expect(distance[0]).toBe(2);
    expect(distance[7 * WIDTH + 11]).toBe(9);
  });
});

describe('settlementMiddleOf', () => {
  it('takes the middle of what a fort rings, and the middle of what a village stands on', () => {
    const layout = village();
    const site = settlementSiteOf(layout, WIDTH, HEIGHT);

    expect(settlementMiddleOf(layout, site, WIDTH, HEIGHT)).toEqual({ x: 4, y: 4 });
    expect(
      settlementMiddleOf({ ...layout, ring: { middle: { x: 9, y: 2 }, reach: { x: 3, y: 2 } } }, site, WIDTH, HEIGHT)
    ).toEqual({
      x: 9,
      y: 2,
    });
  });
});

describe('terraceSettlement', () => {
  it('levels the site and an apron round it to the height at its middle, and blends out to the country', () => {
    const layout = village();
    const terraced = terraceSettlement(slopedRaster(), layout, { width: WIDTH, height: HEIGHT }, GridType.SQUARE);
    const level = heightAtCell(slopedRaster(), 4, 4);

    for (const [x, y] of [
      [3, 3],
      [6, 3],
      [3, 5],
      [7, 3],
      [2, 2],
      [4, 6],
    ]) {
      expect(heightAtCell(terraced, x, y), `${x},${y}`).toBeCloseTo(level, 5);
    }
    // Two cells past the apron on the east, the ground is halfway back to the country's.
    const country = heightAtCell(slopedRaster(), 8, 3);
    expect(heightAtCell(terraced, 8, 3)).toBeCloseTo((level + country) / 2, 5);
    // Beyond the band the country stands as it was.
    expect(heightAtCell(terraced, 10, 3)).toBeCloseTo(heightAtCell(slopedRaster(), 10, 3), 5);
    expect(heightAtCell(terraced, 11, 7)).toBeCloseTo(heightAtCell(slopedRaster(), 11, 7), 5);
  });

  it('never sinks the site below the floor', () => {
    const raster = slopedRaster();
    raster.heights.fill(-1);

    const terraced = terraceSettlement(raster, village(), { width: WIDTH, height: HEIGHT }, GridType.SQUARE);

    expect(heightAtCell(terraced, 4, 4)).toBe(0);
  });
});
