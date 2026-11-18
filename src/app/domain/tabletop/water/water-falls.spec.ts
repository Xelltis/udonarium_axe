import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { type WaterArea, waterCellsOf } from '@axe/domain/tabletop/water/water-cells';
import {
  SPOUT_WATER_COLOUR,
  waterColumnsOf,
  waterFallsOf,
  type WaterSpout,
} from '@axe/domain/tabletop/water/water-falls';
import { waterSidesOf } from '@axe/domain/tabletop/water/water-sides';

const G = 50;
const EAST = 90;
const NORTH = 0;

function area(partial: Partial<WaterArea>): WaterArea {
  return {
    identifier: 'channel',
    left: G,
    top: G,
    width: G,
    height: G,
    floorPx: 0,
    surfacePx: 40,
    color: '#3399cc',
    density: 0.6,
    turbidity: 0.15,
    dirt: 0,
    leaves: 0,
    flowSpeed: 0.5,
    flowDirection: EAST,
    ice: 0,
    ...partial,
  };
}

/** A channel one cell long with a basin one cell long east of it, standing lower unless told otherwise. */
function channelAndBasin(channel: Partial<WaterArea> = {}, basin: Partial<WaterArea> = {}) {
  const grid = cellGridOf(5, 4, G, GridType.SQUARE);
  const cells = waterCellsOf(grid, [
    area(channel),
    area({ identifier: 'basin', left: 2 * G, surfacePx: 15, flowSpeed: 0, ...basin }),
  ]);
  return { grid, cells };
}

function spout(partial: Partial<WaterSpout> = {}): WaterSpout {
  return { key: 'pipe', x: 2.5 * G, y: G, mouthPx: 60, outX: 0, outY: 1, widthPx: 10, ...partial };
}

describe('waterFallsOf()', () => {
  it('has water flowing out over an edge fall onto the lower water beyond it', () => {
    const { grid, cells } = channelAndBasin();

    const falls = waterFallsOf(grid, cells);

    expect(falls).toHaveLength(1);
    expect(falls[0]).toMatchObject({
      index: cellIndexOf(grid, 1, 1),
      across: cellIndexOf(grid, 2, 1),
      x0: 2 * G,
      x1: 2 * G,
      outX: 1,
      outY: 0,
      topPx: 40,
      bottomPx: 15,
    });
  });

  it('names a fall as the side of the water along the same edge is named', () => {
    const { grid, cells } = channelAndBasin();

    const [fall] = waterFallsOf(grid, cells);

    const between = waterSidesOf(grid, cells).filter((side) => side.x0 === 2 * G && side.x1 === 2 * G);
    expect(between.map((side) => side.key)).toEqual([fall.key]);
  });

  it('leaves still water standing beside lower water as it stood', () => {
    const { grid, cells } = channelAndBasin({ flowSpeed: 0 });
    expect(waterFallsOf(grid, cells)).toEqual([]);
  });

  it('lets water flowing along an edge slide past it', () => {
    const { grid, cells } = channelAndBasin({ flowDirection: NORTH });
    expect(waterFallsOf(grid, cells)).toEqual([]);
  });

  it('has water flowing aslant go over the edges it runs out across', () => {
    const { grid, cells } = channelAndBasin({ flowDirection: 45 });
    expect(waterFallsOf(grid, cells).map((fall) => [fall.outX, fall.outY])).toEqual([[1, 0]]);
  });

  it('does not fall onto water a quarter of a cell lower or less', () => {
    const { grid, cells } = channelAndBasin({}, { surfacePx: 40 - 0.25 * G + 1 });
    expect(waterFallsOf(grid, cells)).toEqual([]);
  });

  it('does not fall where the water is frozen hard enough to stand on', () => {
    const { grid, cells } = channelAndBasin({ ice: 0.5 });
    expect(waterFallsOf(grid, cells)).toEqual([]);
  });

  it('does not fall onto ground, however low, nor over the edge of the grid', () => {
    const grid = cellGridOf(2, 3, G, GridType.SQUARE);
    const cells = waterCellsOf(grid, [area({ left: G })]);
    expect(waterFallsOf(grid, cells)).toEqual([]);
    const inland = cellGridOf(5, 4, G, GridType.SQUARE);
    expect(waterFallsOf(inland, waterCellsOf(inland, [area({})]))).toEqual([]);
  });

  it('does not fall onto a cell of the lower water whose ground has risen through its surface', () => {
    const { grid, cells } = channelAndBasin();
    const across = cellIndexOf(grid, 2, 1);
    const banked = new Map(
      [...cells].map(([index, cell]) => [index, index === across ? { ...cell, floorPx: 55 } : cell])
    );

    expect(waterFallsOf(grid, cells)).toHaveLength(1);
    expect(waterFallsOf(grid, banked)).toEqual([]);
  });

  it.each([GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL])(
    'falls over the edges of a hex the flow runs out across on %s',
    (type) => {
      const grid = cellGridOf(6, 6, G, type);
      const high = cellIndexOf(grid, 2, 2);
      const cells = new Map(
        [
          ...waterCellsOf(grid, [area({ left: 0, top: 0, width: 6 * G, height: 6 * G, surfacePx: 15, flowSpeed: 0 })]),
        ].map(([index, cell]) => [
          index,
          index === high ? { ...cell, surfacePx: 40, flowSpeed: 0.5, flowDirection: EAST } : cell,
        ])
      );

      const falls = waterFallsOf(grid, cells);

      expect(falls.length).toBeGreaterThan(0);
      expect(falls.length).toBeLessThan(6);
      for (const fall of falls) {
        expect(fall.index).toBe(high);
        expect(fall.outX).toBeGreaterThanOrEqual(0.38);
      }
    }
  );
});

describe('waterColumnsOf()', () => {
  it('pours from a spout down onto the water under where it lands, in the look of that water', () => {
    const { grid, cells } = channelAndBasin({}, { color: '#556b2f', dirt: 0.4, turbidity: 0.8 });

    const columns = waterColumnsOf(grid, cells, [spout()], () => 0);

    expect(columns).toHaveLength(1);
    expect(columns[0]).toMatchObject({
      fromX: 2.5 * G,
      fromY: G,
      x: 2.5 * G,
      y: G + 0.3 * G,
      topPx: 60,
      bottomPx: 15,
      halfPx: 5,
      onWater: true,
      color: '#556b2f',
      dirt: 0.4,
      turbidity: 0.8,
    });
  });

  it('pours onto the ground where there is no water below, as high as the ground stands there', () => {
    const grid = cellGridOf(5, 4, G, GridType.SQUARE);

    const columns = waterColumnsOf(grid, new Map(), [spout()], () => 12);

    expect(columns[0]).toMatchObject({ bottomPx: 12, onWater: false, color: SPOUT_WATER_COLOUR });
  });

  it('asks what it lands on for water coming down from the height of its mouth, where it lands', () => {
    const grid = cellGridOf(5, 4, G, GridType.SQUARE);
    const asked: number[][] = [];

    const columns = waterColumnsOf(grid, new Map(), [spout()], (x, y, belowPx) => {
      asked.push([x, y, belowPx]);
      return 30;
    });

    expect(asked).toEqual([[2.5 * G, G + 0.3 * G, 60]]);
    expect(columns[0].bottomPx).toBe(30);
  });

  it('lands on a block standing out of the water under it rather than on the water, in the look of that water still', () => {
    const { grid, cells } = channelAndBasin({}, { color: '#556b2f' });

    const columns = waterColumnsOf(grid, cells, [spout()], () => 30);

    expect(columns[0]).toMatchObject({ bottomPx: 30, onWater: false, color: '#556b2f' });
  });

  it('lands on the water over a block or a bed it has covered', () => {
    const { grid, cells } = channelAndBasin();

    expect(waterColumnsOf(grid, cells, [spout()], () => 10)[0]).toMatchObject({ bottomPx: 15, onWater: true });
    expect(waterColumnsOf(grid, cells, [spout()], () => -40)[0]).toMatchObject({ bottomPx: 15, onWater: true });
  });

  it('lands on the ground of a cell of the water whose ground has risen through its surface', () => {
    const { grid, cells } = channelAndBasin();
    const banked = new Map([...cells].map(([index, cell]) => [index, { ...cell, floorPx: 25 }]));

    expect(waterColumnsOf(grid, banked, [spout()], () => 25)[0]).toMatchObject({ bottomPx: 25, onWater: false });
    expect(waterColumnsOf(grid, banked, [spout()], () => 0)[0]).toMatchObject({ bottomPx: 0, onWater: false });
  });

  it('pours nothing from a spout no higher than what lies below it', () => {
    const { grid, cells } = channelAndBasin();
    expect(waterColumnsOf(grid, cells, [spout({ mouthPx: 15 })], () => 0)).toEqual([]);
  });
});
