import { FIELD_PROP_IDS } from '@axe/domain/tabletop/field/field-atmosphere';
import { planField } from '@axe/domain/tabletop/field/field-generator';
import { levelUnder } from '@axe/domain/tabletop/field/field-sample-points';
import {
  layMillStream,
  STREAM_DEPTH,
  streamSurfaceOver,
  watermillHouseOf,
  watermillWheelOf,
} from '@axe/domain/tabletop/field/mill-stream';
import { settlementBlocks } from '@axe/domain/tabletop/field/settlement-blocks';
import {
  laySettlement,
  SETTLEMENT_ZONES,
  type SettlementLayout,
  type SettlementMill,
} from '@axe/domain/tabletop/field/settlement-layout';
import { settlementSiteOf } from '@axe/domain/tabletop/field/settlement-terrace';
import { cellCenterOf, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { GROUND_HEIGHT_STEP } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundChunksOfRaster, type GroundRaster } from '@axe/domain/tabletop/ground/ground-raster';
import { FLAT_GROUND, groundLiftOfBlock, groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { MAP_MAX_TERRAINS, type MapAmbience, type MapBlock, type MapRect } from '@axe/domain/tabletop/map-blocks';
import { blockOrigin, cellCentre } from '@axe/domain/tabletop/map-grid';
import { type WaterArea, waterCellsOf } from '@axe/domain/tabletop/water/water-cells';

/** The boards a village is laid on, the smallest the panel makes on squares and on hexes among them. */
const BOARDS: readonly { readonly width: number; readonly height: number; readonly gridType: GridType }[] = [
  { width: 20, height: 15, gridType: GridType.SQUARE },
  { width: 40, height: 30, gridType: GridType.SQUARE },
  { width: 60, height: 45, gridType: GridType.SQUARE },
  { width: 15, height: 11, gridType: GridType.HEX_VERTICAL },
  { width: 30, height: 23, gridType: GridType.HEX_HORIZONTAL },
  { width: 45, height: 34, gridType: GridType.HEX_VERTICAL },
];
const DENSITIES = [0, 50, 100];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42, 1234, 20261106];
const GRIDS = [GridType.SQUARE, GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL];

/** The step to the next cell for each way water runs. */
const STEP_OF: Readonly<Record<number, readonly [number, number]>> = {
  0: [0, -1],
  90: [1, 0],
  180: [0, 1],
  270: [-1, 0],
};

interface Laid {
  readonly before: SettlementLayout;
  readonly after: SettlementLayout;
  readonly width: number;
  readonly height: number;
  readonly gridType: GridType;
  readonly at: string;
}

/** Every village laid on every board, at every density and seed, before its stream and mills and after. */
function villages(): Laid[] {
  return BOARDS.flatMap(({ width, height, gridType }) =>
    DENSITIES.flatMap((density) =>
      SEEDS.map((seed) => ({
        before: laySettlement('village', width, height, seed, density),
        after: layMillStream(laySettlement('village', width, height, seed, density), width, height, seed, gridType),
        width,
        height,
        gridType,
        at: `${width}x${height} grid ${gridType} density ${density} seed ${seed}`,
      }))
    )
  );
}

const LAID = villages();

/** The index of every cell of a rectangle, row by row. */
function cellsOf(rect: MapRect, width: number): number[] {
  const cells: number[] = [];
  for (let y = rect.y; y < rect.y + rect.h; y++)
    for (let x = rect.x; x < rect.x + rect.w; x++) cells.push(y * width + x);
  return cells;
}

/** The cells of the stream that hold water: every cell of it but the bridges. */
function wetOf(layout: SettlementLayout, width: number): Set<number> {
  return new Set((layout.stream?.cells ?? []).filter((cell) => !cell.bridge).map((cell) => cell.y * width + cell.x));
}

/** The cells a stream may not run through: the doorsteps of every door and the way into every fenced field. */
function doorstepsOf(layout: SettlementLayout, width: number, height: number): Set<number> {
  const steps = new Set<number>();
  const mark = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < width && y < height) steps.add(y * width + x);
  };
  for (const door of layout.doors) {
    if (door.across === 'y') [-1, 1].forEach((d) => mark(door.x, door.y + d));
    else [-1, 1].forEach((d) => mark(door.x + d, door.y));
  }
  for (const { rect, crop } of layout.crops) {
    if (crop === 'rice') continue;
    for (let x = rect.x - 1; x <= rect.x + rect.w; x++) {
      if (layout.walls[(rect.y - 1) * width + x] === 0) mark(x, rect.y - 2);
      if (layout.walls[(rect.y + rect.h) * width + x] === 0) mark(x, rect.y + rect.h + 1);
    }
  }
  return steps;
}

/** The cells the village stood anything on or grew anything in, or a fire burns in. */
function builtOf(layout: SettlementLayout, width: number): Set<number> {
  const built = new Set<number>();
  layout.walls.forEach((wall, cell) => wall && built.add(cell));
  for (const point of [...layout.doors, ...layout.things, ...layout.fires]) built.add(point.y * width + point.x);
  for (const { rect } of layout.crops) cellsOf(rect, width).forEach((cell) => built.add(cell));
  return built;
}

/** The first row of road under a column. */
function roadRowAt(layout: SettlementLayout, width: number, height: number, column: number): number {
  for (let y = 0; y < height; y++) if (layout.zones[y * width + column] === SETTLEMENT_ZONES.road) return y;
  return -1;
}

/** A turn clockwise on the board, y running down it, of a step across it. */
function turned([x, y]: readonly [number, number], turn: number): [number, number] {
  const radians = (turn * Math.PI) / 180;
  return [
    Math.round(x * Math.cos(radians) - y * Math.sin(radians)) + 0,
    Math.round(x * Math.sin(radians) + y * Math.cos(radians)) + 0,
  ];
}

/** A village on an open board of squares with a road across it, and anything else asked for taken. */
function openVillage(width: number, height: number, road: number, taken: (x: number, y: number) => boolean) {
  const zones = new Uint8Array(width * height);
  const takenCells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (y === road || y === road + 1) {
        zones[y * width + x] = SETTLEMENT_ZONES.road;
        takenCells[y * width + x] = 1;
      } else if (taken(x, y)) takenCells[y * width + x] = 1;
    }
  }
  const village: SettlementLayout = {
    kind: 'village',
    zones,
    walls: new Uint8Array(width * height),
    doors: [],
    crops: [],
    things: [],
    fires: [],
    taken: takenCells,
    ring: null,
  };
  return village;
}

describe('layMillStream()', () => {
  it('runs the same stream and puts up the same mills from the same seed, and others from another', () => {
    for (const { width, height, gridType } of BOARDS) {
      const lay = (seed: number) =>
        layMillStream(laySettlement('village', width, height, seed), width, height, seed, gridType);
      expect(lay(7)).toEqual(lay(7));
      expect([lay(7).stream, lay(7).mills]).not.toEqual([lay(8).stream, lay(8).mills]);
    }
  });

  it('leaves everything the village laid as it was, and takes only the stream but its bridges, the watermill’s house and the windmill', () => {
    for (const { before, after, width, at } of LAID) {
      expect(after.kind, at).toBe(before.kind);
      expect(after.zones, at).toEqual(before.zones);
      expect(after.walls, at).toEqual(before.walls);
      expect(after.doors, at).toEqual(before.doors);
      expect(after.crops, at).toEqual(before.crops);
      expect(after.things, at).toEqual(before.things);
      expect(after.fires, at).toEqual(before.fires);
      expect(after.ring, at).toEqual(before.ring);

      const added = new Set(wetOf(after, width));
      for (const mill of after.mills ?? []) {
        for (const cell of cellsOf(mill.kind === 'watermill' ? watermillHouseOf(mill) : mill.rect, width)) {
          expect(added.has(cell), `${at}: ${mill.kind} on the stream`).toBe(false);
          added.add(cell);
        }
      }
      const wrong = [...after.taken].flatMap((taken, cell) =>
        taken !== (before.taken[cell] || added.has(cell) ? 1 : 0) ? [cell] : []
      );
      expect(wrong, at).toEqual([]);
    }
  });

  it('runs a stream a cell wide from the top edge to the bottom, each cell beside the one before', () => {
    const laid = LAID.filter(({ after }) => after.stream);
    expect(laid.length).toBeGreaterThan(LAID.length * 0.8);
    for (const { after, width, height, at } of laid) {
      const cells = after.stream!.cells;
      expect(cells[0].y, at).toBe(0);
      expect(cells.at(-1)!.y, at).toBe(height - 1);
      expect(
        cells.filter((cell) => cell.y === height - 1),
        at
      ).toHaveLength(1);
      expect(new Set(cells.map((cell) => cell.y * width + cell.x)).size, at).toBe(cells.length);
      for (let i = 1; i < cells.length; i++) {
        expect(Math.abs(cells[i].x - cells[i - 1].x) + Math.abs(cells[i].y - cells[i - 1].y), at).toBe(1);
      }
    }
  });

  it('runs each cell’s water on towards the next, and off the bottom of the board out of the last', () => {
    for (const { after, at } of LAID.filter(({ after }) => after.stream)) {
      const cells = after.stream!.cells;
      cells.forEach((cell, i) => {
        const next = cells[i + 1] ?? { x: cell.x, y: cell.y + 1 };
        expect(STEP_OF[cell.flow], at).toEqual([next.x - cell.x, next.y - cell.y]);
      });
    }
  });

  it('crosses the road once or more, straight over it, and runs through nothing else the village laid', () => {
    for (const { before, after, width, height, gridType, at } of LAID.filter(({ after }) => after.stream)) {
      const cells = after.stream!.cells;
      const built = builtOf(before, width);
      const doorsteps = doorstepsOf(before, width, height);
      for (const [i, cell] of cells.entries()) {
        const index = cell.y * width + cell.x;
        const where = `${at} at ${cell.x},${cell.y}`;
        if (cell.bridge) {
          expect(before.zones[index], where).toBe(SETTLEMENT_ZONES.road);
          expect([0, 180], where).toContain(cell.flow);
          expect(cells[i - 1].flow, where).toBe(cell.flow);
          continue;
        }
        expect(before.zones[index], where).toBe(SETTLEMENT_ZONES.ground);
        expect(before.taken[index], where).toBe(0);
        expect(built.has(index), where).toBe(false);
        expect(doorsteps.has(index), where).toBe(false);
        if (!isHexGrid(gridType)) continue;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = cell.x + dx;
            const y = cell.y + dy;
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            const beside = y * width + x;
            expect(before.taken[beside] && before.zones[beside] !== SETTLEMENT_ZONES.road, where).toBeFalsy();
          }
        }
      }
      const bridges = cells.flatMap((cell, i) => (cell.bridge && !cells[i - 1].bridge ? [i] : []));
      expect(bridges.length, at).toBeGreaterThan(0);
      for (const first of bridges) {
        expect([cells[first].bridge, cells[first + 1].bridge, cells[first + 2].bridge], at).toEqual([
          true,
          true,
          false,
        ]);
      }
    }
  });

  it('turns a watermill so the foot of its wheel runs the way it is turned, its wheel on the right of that way and its house on the left', () => {
    for (const turn of [0, 90, 180, 270]) {
      const rect = turn % 180 === 0 ? { x: 5, y: 5, w: 3, h: 2 } : { x: 5, y: 5, w: 2, h: 3 };
      const mill: SettlementMill = { kind: 'watermill', rect, turn };
      const wheel = watermillWheelOf(mill);
      const house = watermillHouseOf(mill);
      const middle = (box: MapRect) => [box.x + box.w / 2, box.y + box.h / 2];
      const [wx, wy] = middle(wheel);
      const [hx, hy] = middle(house);
      const side = turned([1, 0], turn);
      expect([Math.sign(wx - hx), Math.sign(wy - hy)], `${turn}`).toEqual(side);
      expect(turned([0, -1], turn), `${turn}`).toEqual(STEP_OF[turn]);
      expect(cellsOf(wheel, 20).length + cellsOf(house, 20).length).toBe(6);
    }
  });

  it('stands a watermill with its wheel in two cells of the stream running straight, and its house on open ground on the bank', () => {
    let along = 0;
    let watermills = 0;
    for (const { before, after, width, height, at } of LAID) {
      const mill = after.mills?.find((each) => each.kind === 'watermill');
      if (!mill) continue;
      watermills++;
      const cells = after.stream!.cells;
      const wheel = cellsOf(watermillWheelOf(mill), width);
      const course = wheel.map((cell) => cells.findIndex((each) => each.y * width + each.x === cell));
      expect(
        course.every((i) => i >= 0 && !cells[i].bridge),
        at
      ).toBe(true);
      expect(Math.abs(course[0] - course[1]), at).toBe(1);
      const flow = cells[Math.min(...course)].flow;
      expect(cells[Math.max(...course)].flow, at).toBe(flow);
      expect([flow, (flow + 180) % 360], at).toContain(mill.turn);
      if (mill.turn === flow) along++;

      const wet = wetOf(after, width);
      const doorsteps = doorstepsOf(before, width, height);
      for (const cell of cellsOf(watermillHouseOf(mill), width)) {
        expect(before.zones[cell], at).toBe(SETTLEMENT_ZONES.ground);
        expect(before.taken[cell], at).toBe(0);
        expect(wet.has(cell) || doorsteps.has(cell), at).toBe(false);
      }
      const clear = { x: mill.rect.x - 2, y: mill.rect.y - 2, w: mill.rect.w + 4, h: mill.rect.h + 4 };
      for (let y = clear.y; y < clear.y + clear.h; y++) {
        for (let x = clear.x; x < clear.x + clear.w; x++) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          expect(before.zones[y * width + x], `${at}: road beside the watermill`).not.toBe(SETTLEMENT_ZONES.road);
        }
      }
    }
    expect(watermills).toBeGreaterThan(LAID.length * 0.75);
    expect(along).toBeGreaterThan(watermills * 0.75);
  });

  it('stands a watermill on the far bank only where the near bank has no room', () => {
    const width = 16;
    const height = 20;
    const seed = 5;
    const open = layMillStream(
      openVillage(width, height, 9, () => false),
      width,
      height,
      seed
    );
    const column = open.stream!.cells[0].x;
    expect(open.stream!.cells.every((cell) => cell.x === column)).toBe(true);
    const near = open.mills!.find((mill) => mill.kind === 'watermill')!;
    expect(near.turn).toBe(180);
    expect(watermillHouseOf(near).x).toBe(column + 1);

    const crowded = layMillStream(
      openVillage(width, height, 9, (x) => x > column),
      width,
      height,
      seed
    );
    expect(crowded.stream!.cells.every((cell) => cell.x === column)).toBe(true);
    const far = crowded.mills!.find((mill) => mill.kind === 'watermill')!;
    expect(far.turn).toBe(0);
    expect(watermillHouseOf(far).x).toBe(column - 2);
    expect(watermillWheelOf(far).x).toBe(column);
  });

  it('goes round the doorstep of a door rather than straight over it', () => {
    const width = 16;
    const height = 20;
    const seed = 5;
    const column = layMillStream(
      openVillage(width, height, 9, () => false),
      width,
      height,
      seed
    ).stream!.cells[0].x;
    const village: SettlementLayout = {
      ...openVillage(width, height, 9, (x, y) => x === column + 1 && y === 4),
      doors: [{ x: column + 1, y: 4, across: 'x', mirrored: false, kind: 'door', wall: 'timberWall' }],
    };
    const cells = layMillStream(village, width, height, seed).stream!.cells;
    expect(cells.some((cell) => cell.x === column && cell.y === 4)).toBe(false);
    expect(cells.some((cell) => cell.x !== column)).toBe(true);
  });

  it('runs no stream, and stands no watermill, where nothing open reaches from the top edge to the bottom', () => {
    const blocked = layMillStream(
      openVillage(16, 20, 9, (_x, y) => y === 4),
      16,
      20,
      5
    );
    expect(blocked.stream).toBeUndefined();
    expect(blocked.mills?.some((mill) => mill.kind === 'watermill') ?? false).toBe(false);
    expect(blocked.mills?.some((mill) => mill.kind === 'windmill')).toBe(true);
  });

  it('stands a windmill three cells square on open ground with nothing round it, its sails facing the road', () => {
    let windmills = 0;
    for (const { before, after, width, height, at } of LAID) {
      const mill = after.mills?.find((each) => each.kind === 'windmill');
      if (!mill) continue;
      windmills++;
      expect([mill.rect.w, mill.rect.h], at).toEqual([3, 3]);
      const doorsteps = doorstepsOf(before, width, height);
      const wet = wetOf(after, width);
      const own = new Set(cellsOf(mill.rect, width));
      for (const cell of own) {
        expect(before.zones[cell], at).toBe(SETTLEMENT_ZONES.ground);
        expect(before.taken[cell] || wet.has(cell) || doorsteps.has(cell), at).toBeFalsy();
      }
      for (let y = mill.rect.y - 1; y <= mill.rect.y + mill.rect.h; y++) {
        for (let x = mill.rect.x - 1; x <= mill.rect.x + mill.rect.w; x++) {
          if (x < 0 || y < 0 || x >= width || y >= height || own.has(y * width + x)) continue;
          expect(after.taken[y * width + x], `${at}: beside the windmill at ${x},${y}`).toBe(0);
        }
      }
      const road = roadRowAt(before, width, height, mill.rect.x + 1);
      expect(mill.turn, at).toBe(mill.rect.y + mill.rect.h <= road ? 0 : 180);
    }
    expect(windmills).toBeGreaterThan(LAID.length * 0.75);
  });
});

/** The water a table lays from the ambiences of a plan, on a board of cells this many pixels across. */
function watersOf(ambiences: readonly MapAmbience[], gridType: GridType, size: number): WaterArea[] {
  return ambiences.flatMap(({ rect, water }, index) => {
    if (!water) return [];
    const at = blockOrigin(rect, { type: gridType, sizePx: size });
    return [
      {
        identifier: `water-${index}`,
        left: at.x,
        top: at.y,
        width: rect.w * size,
        height: rect.h * size,
        floorPx: 0,
        surfacePx: water.surface * size,
        color: water.color,
        density: 0.6,
        turbidity: water.turbidity,
        dirt: water.dirt,
        leaves: water.leaves,
        flowSpeed: water.flowSpeed ?? 0,
        flowDirection: water.flowDirection ?? 0,
        ice: water.ice,
      },
    ];
  });
}

/** The ground of a raster as the table keeps it, in chunks of whole steps of height. */
function groundOf(raster: GroundRaster) {
  return groundSurfaceOf(groundChunksOfRaster(raster));
}

/** The box a block stands over on the table, on a board of cells a cell across. */
function boxOf(rect: MapRect, gridType: GridType) {
  return { location: blockOrigin(rect, { type: gridType, sizePx: 1 }), width: rect.w, depth: rect.h };
}

/** The first seed whose village on a board of this size and grid has a stream, both mills and a paddy. */
function seedWithEverything(size: number, gridType: GridType): number {
  for (let seed = 1; seed < 100; seed++) {
    const settlement = planField({ atmosphere: 'village', size, density: 50, seed, gridType }).layout.settlement!;
    const kinds = (settlement.mills ?? []).map((mill) => mill.kind);
    if (
      settlement.stream &&
      kinds.includes('watermill') &&
      kinds.includes('windmill') &&
      settlement.crops.some((crop) => crop.crop === 'rice')
    ) {
      return seed;
    }
  }
  throw new Error('no village with a stream, both mills and a paddy');
}

describe('a village with a stream and mills on the table', () => {
  it('digs the stream’s bed half a cell under the terrace and out to the board’s edge, sloping inside its own cells, the bridges and the rest of the site left at the terrace', () => {
    for (const gridType of GRIDS) {
      for (const relief of [0, 2]) {
        const plan = planField({ atmosphere: 'village', size: 40, density: 50, seed: 7, relief, gridType });
        const { layout } = plan;
        const raster = layout.relief!;
        const level = layout.settlementLevel!;
        const settlement = layout.settlement!;
        const wet = wetOf(settlement, layout.width);
        const site = settlementSiteOf(settlement, layout.width, layout.height);
        const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < layout.width && y < layout.height;
        // A cell off the board is the stream's where the cell of the edge beside it is: the bed runs out
        // to the edge the stream leaves by.
        const edged = (value: number, size: number) => Math.min(size - 1, Math.max(0, value));
        const inStream = (x: number, y: number) =>
          wet.has(edged(y, layout.height) * layout.width + edged(x, layout.width)) ? 0 : 1;
        const onSite = (x: number, y: number) => (inside(x, y) && site[y * layout.width + x] ? 0 : 1);
        const bridges = settlement.stream!.cells.filter((cell) => cell.bridge);
        expect(bridges.length).toBeGreaterThan(0);
        expect(bridges.every((cell) => site[cell.y * layout.width + cell.x])).toBe(true);
        let dug = 0;
        let kept = 0;
        for (let row = 0; row < raster.rows; row++) {
          for (let column = 0; column < raster.columns; column++) {
            const height = raster.heights[row * raster.columns + column];
            const where = `grid ${gridType} relief ${relief} sample ${column},${row}`;
            if (levelUnder(gridType, column / 2, row / 2, inStream) === 0) {
              expect(height, where).toBeCloseTo(level - STREAM_DEPTH, 5);
              dug++;
            } else if (relief === 0 || levelUnder(gridType, column / 2, row / 2, onSite) === 0) {
              expect(height, where).toBeCloseTo(level, 5);
              kept++;
            }
          }
        }
        expect(dug).toBeGreaterThanOrEqual(wet.size);
        expect(kept).toBeGreaterThan(dug);
        if (relief === 0) expect(level).toBe(0);
      }
    }
  });

  it('leaves the ground of a fort flat where no height is asked for, as nothing is dug into it', () => {
    const plan = planField({ atmosphere: 'stoneFort', size: 40, density: 50, seed: 7 });
    expect(plan.layout.relief ?? null).toBeNull();
    expect(plan.layout.settlementLevel).toBe(0);
  });

  it('lays the water of the stream and of the paddies where the table draws water, on flat ground and on raised', () => {
    const size = 50;
    for (const gridType of GRIDS) {
      const seed = seedWithEverything(40, gridType);
      for (const relief of [0, 2]) {
        const plan = planField({ atmosphere: 'village', size: 40, density: 50, seed, relief, gridType });
        const { layout } = plan;
        const grid = cellGridOf(layout.width, layout.height, size, gridType);
        const ground = groundOf(layout.relief!);
        const cells = waterCellsOf(grid, watersOf(plan.blocks.ambiences, gridType, size), (index) => {
          const centre = cellCenterOf(grid, index);
          return ground.heightAt(centre.x / size, centre.y / size) * size;
        });
        const settlement = layout.settlement!;
        const expected = new Set(wetOf(settlement, layout.width));
        for (const { rect, crop } of settlement.crops) {
          if (crop === 'rice') cellsOf(rect, layout.width).forEach((cell) => expected.add(cell));
        }
        expect(new Set(cells.keys()), `grid ${gridType} relief ${relief} seed ${seed}`).toEqual(expected);
      }
    }
  });

  it('lays the stream’s water over its cells but its bridges, a lot for each way it runs, the areas never overlapping', () => {
    for (const gridType of GRIDS) {
      for (const seed of [1, 7, 42]) {
        for (const relief of [0, 2]) {
          const plan = planField({ atmosphere: 'village', size: 40, density: 50, seed, relief, gridType });
          const { layout } = plan;
          const settlement = layout.settlement!;
          const flowing = plan.blocks.ambiences.filter((ambience) => (ambience.water?.flowSpeed ?? 0) > 0);
          const covered = flowing.flatMap((ambience) =>
            cellsOf(ambience.rect, layout.width).map((cell) => ({ cell, flow: ambience.water!.flowDirection }))
          );
          const at = `grid ${gridType} seed ${seed} relief ${relief}`;
          expect(new Set(covered.map(({ cell }) => cell)).size, at).toBe(covered.length);
          const wet = settlement.stream!.cells.filter((cell) => !cell.bridge);
          expect(covered.map(({ cell, flow }) => `${cell}:${flow}`).sort(), at).toEqual(
            wet.map((cell) => `${cell.y * layout.width + cell.x}:${cell.flow}`).sort()
          );
          if (isHexGrid(gridType)) {
            const flat = isFlatTopGrid(gridType);
            expect(
              flowing.every((ambience) => (flat ? ambience.rect.w : ambience.rect.h) === 1),
              at
            ).toBe(true);
          }
          for (const ambience of flowing) {
            expect(ambience.water, at).toMatchObject({
              surface: streamSurfaceOver(layout.settlementLevel!),
              turbidity: 0.2,
              flowSpeed: 0.5,
            });
          }
          const slow = plan.blocks.slows!.filter((patch) => patch.color === '#3f7a8a');
          expect(slow.flatMap((patch) => cellsOf(patch.rect, layout.width)).sort(), at).toEqual(
            wet.map((cell) => cell.y * layout.width + cell.x).sort()
          );
          expect(
            slow.every((patch) => patch.extraCost === 1),
            at
          ).toBe(true);
          const gravel = plan.blocks.paint.filter(
            (patch) => patch.material?.kind === 'texture' && patch.material.id === 'gravel'
          );
          expect(gravel.flatMap((patch) => cellsOf(patch.rect, layout.width)).sort(), at).toEqual(
            wet.map((cell) => cell.y * layout.width + cell.x).sort()
          );
        }
      }
    }
  });

  it('stands each mill as one block of its model, on squares and hexes alike, nobody seeing past it or climbing it', () => {
    for (const gridType of GRIDS) {
      const seed = seedWithEverything(40, gridType);
      const plan = planField({ atmosphere: 'village', size: 40, density: 50, seed, relief: 2, gridType, models: true });
      const mills = plan.layout.settlement!.mills!;
      expect(mills.map((mill) => mill.kind).sort()).toEqual(['watermill', 'windmill']);
      for (const mill of mills) {
        const blocks = plan.blocks.blocks.filter((block) => block.thing === mill.kind);
        expect(blocks).toHaveLength(1);
        expect(blocks[0]).toMatchObject({
          kind: 'prop',
          rect: mill.rect,
          height: mill.kind === 'windmill' ? 5.6 : 2.8,
          blocksSight: true,
          blocksClimb: true,
          model: mill.kind,
        });
        expect(blocks[0].modelTurn ?? 0).toBe(mill.turn);
      }
    }
  });

  it('stands a mill’s one block with its middle on the middle of a hex, a windmill on its middle cell and a watermill on the cell of its house nearest its wheel', () => {
    for (const gridType of GRIDS) {
      const seed = seedWithEverything(40, gridType);
      const plan = planField({ atmosphere: 'village', size: 40, density: 50, seed, relief: 2, gridType, models: true });
      const grid = { type: gridType, sizePx: 1 };
      for (const mill of plan.layout.settlement!.mills!) {
        const block = plan.blocks.blocks.find((each) => each.thing === mill.kind)!;
        if (!isHexGrid(gridType)) {
          expect(block.offset).toBeUndefined();
          continue;
        }
        const origin = blockOrigin(mill.rect, grid);
        const middle = {
          x: origin.x + block.offset!.x + mill.rect.w / 2,
          y: origin.y + block.offset!.y + mill.rect.h / 2,
        };
        const centresOf = (rect: MapRect) =>
          cellsOf(rect, plan.layout.width).map((cell) =>
            cellCentre({ x: cell % plan.layout.width, y: Math.floor(cell / plan.layout.width) }, grid)
          );
        const off = (centre: { x: number; y: number }) => Math.hypot(centre.x - middle.x, centre.y - middle.y);
        if (mill.kind === 'windmill') {
          expect(off(cellCentre({ x: mill.rect.x + 1, y: mill.rect.y + 1 }, grid))).toBeCloseTo(0, 9);
          continue;
        }
        const house = centresOf(watermillHouseOf(mill));
        const wheel = centresOf(watermillWheelOf(mill));
        expect(Math.min(...house.map(off))).toBeCloseTo(0, 9);
        const hub = { x: (wheel[0].x + wheel[1].x) / 2, y: (wheel[0].y + wheel[1].y) / 2 };
        const fromHub = (centre: { x: number; y: number }) => Math.hypot(centre.x - hub.x, centre.y - hub.y);
        expect(fromHub(middle)).toBeCloseTo(Math.min(...house.map(fromHub)), 9);
        expect(fromHub(middle)).toBeLessThan(1.3);
      }
    }
  });

  it('builds a mill of boxes where models are not asked for, a windmill as its whole rectangle and a watermill as its house without its wheel', () => {
    for (const gridType of GRIDS) {
      const seed = seedWithEverything(40, gridType);
      const plan = planField({ atmosphere: 'village', size: 40, density: 50, seed, gridType });
      expect(plan.layout.settlement!.mills).toHaveLength(2);
      for (const mill of plan.layout.settlement!.mills!) {
        const blocks = plan.blocks.blocks.filter((block) => block.thing === mill.kind);
        const standing = mill.kind === 'watermill' ? watermillHouseOf(mill) : mill.rect;
        expect(blocks.every((block) => !block.model && block.blocksSight && block.blocksClimb)).toBe(true);
        expect(blocks.map((block) => block.height)).toEqual(blocks.map(() => (mill.kind === 'windmill' ? 5.6 : 2.2)));
        expect(blocks.flatMap((block) => cellsOf(block.rect, plan.layout.width)).sort()).toEqual(
          cellsOf(standing, plan.layout.width).sort()
        );
        expect(blocks).toHaveLength(isHexGrid(gridType) ? standing.w * standing.h : 1);
      }
    }
  });

  it('stands each mill on the terrace, lifted by as far as the table lets it down into the stream’s bed', () => {
    let watermills = 0;
    for (const gridType of GRIDS) {
      for (const relief of [0, 2]) {
        for (const models of [true, false]) {
          for (const seed of [1, 2, 3, 7, 20261106]) {
            const plan = planField({ atmosphere: 'village', size: 40, density: 50, seed, relief, gridType, models });
            const ground = plan.layout.relief ? groundOf(plan.layout.relief) : FLAT_GROUND;
            const stood = Math.round(plan.layout.settlementLevel! / GROUND_HEIGHT_STEP) * GROUND_HEIGHT_STEP;
            for (const block of plan.blocks.blocks.filter((each) => ['windmill', 'watermill'].includes(each.thing!))) {
              const box = boxOf(block.rect, gridType);
              const location = {
                x: box.location.x + (block.offset?.x ?? 0),
                y: box.location.y + (block.offset?.y ?? 0),
              };
              const lift = groundLiftOfBlock(ground, 1, { ...box, location });
              expect(lift + (block.altitude ?? 0), `grid ${gridType} relief ${relief} seed ${seed}`).toBeCloseTo(
                stood,
                9
              );
              if (block.model === 'watermill') {
                watermills++;
                if (!isHexGrid(gridType)) expect(block.altitude).toBe(STREAM_DEPTH);
              }
            }
          }
        }
      }
    }
    expect(watermills).toBeGreaterThan(10);
  });

  it('lets nothing else the village stood down into the stream’s bed', () => {
    const fieldProps: readonly string[] = FIELD_PROP_IDS;
    let checked = 0;
    for (const gridType of GRIDS) {
      for (const relief of [0, 2]) {
        for (const seed of [1, 2, 3, 7, 42]) {
          const plan = planField({
            atmosphere: 'village',
            size: 40,
            density: 50,
            seed,
            relief,
            gridType,
            models: true,
          });
          const { layout } = plan;
          const raster = layout.relief;
          if (!raster) continue;
          const wet = wetOf(layout.settlement!, layout.width);
          const inStream = (x: number, y: number) =>
            x >= 0 && y >= 0 && x < layout.width && y < layout.height && wet.has(y * layout.width + x) ? 0 : Infinity;
          const filled = Float32Array.from(raster.heights);
          for (let row = 0; row < raster.rows; row++) {
            for (let column = 0; column < raster.columns; column++) {
              if (levelUnder(gridType, column / 2, row / 2, inStream) === 0) {
                filled[row * raster.columns + column] = layout.settlementLevel!;
              }
            }
          }
          const dug = groundOf(raster);
          const undug = groundOf({ ...raster, heights: filled });
          const settled = plan.blocks.blocks.filter(
            (block: MapBlock) =>
              !fieldProps.includes(block.thing ?? '') && !['windmill', 'watermill'].includes(block.thing!)
          );
          expect(settled.length).toBeGreaterThan(0);
          checked++;
          for (const block of settled) {
            expect(
              groundLiftOfBlock(dug, 1, boxOf(block.rect, gridType)),
              `grid ${gridType} relief ${relief} seed ${seed} ${block.thing} at ${block.rect.x},${block.rect.y}`
            ).toBe(groundLiftOfBlock(undug, 1, boxOf(block.rect, gridType)));
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('stays within the terrain limit on every board, each mill drawn as its model a single block', () => {
    for (const gridType of GRIDS) {
      for (const size of [20, 40, 60]) {
        for (const density of [0, 50, 100]) {
          for (const seed of [1, 7, 42]) {
            for (const models of [true, false]) {
              const plan = planField({ atmosphere: 'village', size, density, seed, gridType, models, relief: 2 });
              const at = `grid ${gridType} size ${size} density ${density} seed ${seed} models ${models}`;
              expect(plan.blocks.blocks.length, at).toBeLessThanOrEqual(MAP_MAX_TERRAINS);
              if (!models) continue;
              for (const mill of plan.layout.settlement!.mills ?? []) {
                expect(
                  plan.blocks.blocks.filter((block) => block.thing === mill.kind),
                  at
                ).toHaveLength(1);
              }
            }
          }
        }
      }
    }
  });

  it('floods its paddies as high over the terrace as over flat ground, the stream’s water standing under the terrace', () => {
    const village = layMillStream(laySettlement('village', 40, 30, 3), 40, 30, 3);
    const flat = settlementBlocks(village, 40, 30, 4, false, GridType.SQUARE, 0);
    const raised = settlementBlocks(village, 40, 30, 4, false, GridType.SQUARE, 1.5);
    const surfaces = (blocks: typeof flat, running: boolean) =>
      blocks.ambiences
        .filter((ambience) => (ambience.water!.flowSpeed ?? 0) > 0 === running)
        .map((ambience) => Math.round(ambience.water!.surface * 1000) / 1000);
    expect(surfaces(flat, false).length).toBeGreaterThan(0);
    expect(surfaces(flat, true).length).toBeGreaterThan(0);
    expect(new Set(surfaces(flat, false))).toEqual(new Set([0.08]));
    expect(new Set(surfaces(raised, false))).toEqual(new Set([1.58]));
    expect(new Set(surfaces(flat, true))).toEqual(new Set([0.06]));
    expect(new Set(surfaces(raised, true))).toEqual(new Set([1.3]));
  });
});
