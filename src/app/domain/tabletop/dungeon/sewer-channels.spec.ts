import { HEADED_ORTHOGONAL_STEPS, SQUARE_STEPS_WITH_CORNERS } from '@axe/domain/tabletop/cell-steps';
import { atmosphereById } from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import { DEFAULT_BLOCK_OPTIONS, layoutToBlocks } from '@axe/domain/tabletop/dungeon/dungeon-blocks';
import { generateDungeon, planDungeon } from '@axe/domain/tabletop/dungeon/dungeon-generator';
import { cellAt, DungeonCell, DungeonLayout, WaterwayKind } from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { cutWaterways, reliefOfWaterways } from '@axe/domain/tabletop/dungeon/sewer-channels';
import { GridType } from '@axe/domain/tabletop/game-table';
import { groundChunksOfRaster } from '@axe/domain/tabletop/ground/ground-raster';
import { groundSurfaceOf, lowestGroundPxIn } from '@axe/domain/tabletop/ground/ground-surface';
import { MAP_MAX_TERRAINS, MapRect } from '@axe/domain/tabletop/map-blocks';
import { blockOrigin } from '@axe/domain/tabletop/map-grid';

const SEEDS = [1, 7, 42, 1234, 99999];
const GRIDS = [GridType.SQUARE, GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL];
const SEWER = atmosphereById('sewer');
const PLAN = SEWER.waterways!;

/**
 * The most areas of water, of slow ground or of harm a sewer is laid with, whatever is asked of it. None
 * of them is terrain, so none is held to the terrain's ceiling; measured, a hex board lays under a hundred.
 */
const MOST_WATER_AREAS = 150;

const STEPS = HEADED_ORTHOGONAL_STEPS;

const AROUND = SQUARE_STEPS_WITH_CORNERS;

function dry(cell: number): boolean {
  return cell === DungeonCell.Room || cell === DungeonCell.Corridor || cell === DungeonCell.Door;
}

/** How many cells of floor a piece reaches from the way in without wading, and how many there are. */
function dryReach(layout: DungeonLayout): { reached: number; floor: number } {
  const start = layout.entrance.y * layout.width + layout.entrance.x;
  const seen = new Set<number>([start]);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const x = queue[head] % layout.width;
    const y = Math.floor(queue[head] / layout.width);
    for (const [dx, dy] of STEPS) {
      if (!dry(cellAt(layout, x + dx, y + dy))) continue;
      const next = (y + dy) * layout.width + x + dx;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return { reached: seen.size, floor: Array.from(layout.cells).filter(dry).length };
}

/** How many steps of the walk each cell lies from the nearest basin, or -1 where none is reached. */
function walkFromBasins(layout: DungeonLayout): Int32Array {
  const kinds = layout.waterway!.kinds;
  const distance = new Int32Array(kinds.length).fill(-1);
  const queue: number[] = [];
  kinds.forEach((kind, index) => {
    if (kind !== WaterwayKind.Basin) return;
    distance[index] = 0;
    queue.push(index);
  });
  for (let head = 0; head < queue.length; head++) {
    const x = queue[head] % layout.width;
    const y = Math.floor(queue[head] / layout.width);
    for (const [dx, dy] of STEPS) {
      if (cellAt(layout, x + dx, y + dy) === DungeonCell.Rock) continue;
      const next = (y + dy) * layout.width + x + dx;
      if (distance[next] >= 0) continue;
      distance[next] = distance[queue[head]] + 1;
      queue.push(next);
    }
  }
  return distance;
}

/** Whether water of a kind runs: a channel does, and its outfall with it. */
function runs(kind: number): boolean {
  return kind === WaterwayKind.Channel || kind === WaterwayKind.Outfall;
}

/** The cell a pipe stands in and the cell it faces, each as its place in the board's cells. */
function spoutCells(layout: DungeonLayout): { at: number; before: number; behind: number }[] {
  return (layout.spouts ?? []).map((spout) => {
    const turn = (spout.facing * Math.PI) / 180;
    const dx = Math.round(Math.cos(turn));
    const dy = Math.round(Math.sin(turn));
    return {
      at: spout.y * layout.width + spout.x,
      before: (spout.y + dy) * layout.width + spout.x + dx,
      behind: (spout.y - dy) * layout.width + spout.x - dx,
    };
  });
}

/** Every cell of running water joined to this one, the four ways. */
function runOf(layout: DungeonLayout, first: number): number[] {
  const kinds = layout.waterway!.kinds;
  const run = [first];
  const seen = new Set(run);
  for (let head = 0; head < run.length; head++) {
    const x = run[head] % layout.width;
    const y = Math.floor(run[head] / layout.width);
    for (const [dx, dy] of STEPS) {
      const next = (y + dy) * layout.width + x + dx;
      if (cellAt(layout, x + dx, y + dy) !== DungeonCell.Water || !runs(kinds[next])) continue;
      if (seen.has(next)) continue;
      seen.add(next);
      run.push(next);
    }
  }
  return run;
}

/** How many of the areas given lie over each cell of the board. */
function coverOf(layout: DungeonLayout, rects: readonly MapRect[]): Int32Array {
  const cover = new Int32Array(layout.width * layout.height);
  for (const rect of rects) {
    for (let dy = 0; dy < rect.h; dy++) {
      for (let dx = 0; dx < rect.w; dx++) cover[(rect.y + dy) * layout.width + rect.x + dx]++;
    }
  }
  return cover;
}

function waterCells(layout: DungeonLayout): number[] {
  const cells: number[] = [];
  layout.cells.forEach((cell, index) => {
    if (cell === DungeonCell.Water) cells.push(index);
  });
  return cells;
}

describe('cutWaterways()', () => {
  it('runs a channel down the middle of a passage three cells wide, with a walkway either side of it', () => {
    const layout = generateDungeon({ atmosphere: 'sewer', roomCount: 8, seed: 7 });
    const channels = waterCells(layout).filter((index) => layout.waterway!.kinds[index] === WaterwayKind.Channel);

    expect(channels.length).toBeGreaterThan(0);
    for (const index of channels) {
      const x = index % layout.width;
      const y = Math.floor(index / layout.width);
      for (const [dx, dy] of AROUND) {
        expect([DungeonCell.Corridor, DungeonCell.Water]).toContain(cellAt(layout, x + dx, y + dy));
      }
    }
  });

  it('keeps the water away from every door, and off the stone but where a pipe comes out of it', () => {
    for (const gridType of GRIDS) {
      for (const seed of SEEDS) {
        const layout = generateDungeon({ atmosphere: 'sewer', roomCount: 8, seed, gridType });
        const underPipes = new Set(spoutCells(layout).map((spout) => spout.at));
        for (const index of waterCells(layout)) {
          const x = index % layout.width;
          const y = Math.floor(index / layout.width);
          for (const [dx, dy] of AROUND) {
            const beside = cellAt(layout, x + dx, y + dy);
            expect(beside).not.toBe(DungeonCell.Door);
            if (!underPipes.has(index)) expect(beside).not.toBe(DungeonCell.Rock);
          }
        }
      }
    }
  });

  it('leaves every floor, rooms and walkways alike, to be reached from the way in without wading', () => {
    for (const gridType of GRIDS) {
      for (const seed of SEEDS) {
        for (const entrance of ['stair', 'tunnel'] as const) {
          const layout = generateDungeon({ atmosphere: 'sewer', roomCount: 10, seed, gridType, entrance });
          const { reached, floor } = dryReach(layout);

          expect(waterCells(layout).length).toBeGreaterThan(0);
          expect(reached).toBe(floor);
        }
      }
    }
  });

  it('sinks a basin in each room the plan names, with a ledge of floor left round it', () => {
    let basins = 0;
    for (const seed of SEEDS) {
      const layout = generateDungeon({ atmosphere: 'sewer', roomCount: 8, seed });
      for (const index of waterCells(layout)) {
        if (layout.waterway!.kinds[index] !== WaterwayKind.Basin) continue;
        const x = index % layout.width;
        const y = Math.floor(index / layout.width);
        const underPipe = spoutCells(layout).some((spout) => spout.at === index);
        const ledge = underPipe ? 0 : 1;
        const room = layout.rooms.find(
          (each) =>
            x >= each.x + ledge && y >= each.y + ledge && x < each.x + each.w - ledge && y < each.y + each.h - ledge
        );

        expect(room).toBeDefined();
        expect(PLAN.basinRoles).toContain(room!.role);
        basins++;
      }
    }
    expect(basins).toBeGreaterThan(0);
  });

  it('keeps the way in, the way out, a tunnel’s mouth and the cells beside them out of the water', () => {
    for (const seed of SEEDS) {
      for (const entrance of ['stair', 'tunnel'] as const) {
        const layout = generateDungeon({ atmosphere: 'sewer', roomCount: 8, seed, entrance });
        for (const spot of [layout.entrance, layout.exit, ...(layout.mouth ? [layout.mouth] : [])]) {
          for (const [dx, dy] of [[0, 0], ...AROUND]) {
            expect(cellAt(layout, spot.x + dx, spot.y + dy)).not.toBe(DungeonCell.Water);
          }
        }
      }
    }
  });

  it('leaves the fewest cells dry that bridge the water where it would cut floor off from the way in', () => {
    const width = 11;
    const cells = new Uint8Array(width * width).fill(DungeonCell.Rock);
    for (let y = 1; y < width - 1; y++) cells.fill(DungeonCell.Room, y * width + 1, y * width + width - 1);
    const layout: DungeonLayout = {
      width,
      height: width,
      cells,
      rooms: [{ x: 1, y: 1, w: 9, h: 9, index: 0, role: 'hall' }],
      doors: [],
      doorLeaves: [],
      links: [],
      entrance: { x: 2, y: 2 },
      exit: { x: 5, y: 5 },
      mouth: null,
      keyRoomIndex: -1,
      seed: 1,
    };

    cutWaterways(layout, PLAN);

    const { reached, floor } = dryReach(layout);
    expect(reached).toBe(floor);
    let bridges = 0;
    for (let y = 2; y < width - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const nearEnd = [layout.entrance, layout.exit].some(
          (spot) => Math.abs(spot.x - x) <= 1 && Math.abs(spot.y - y) <= 1
        );
        if (!nearEnd && cellAt(layout, x, y) === DungeonCell.Room) bridges++;
      }
    }
    expect(bridges).toBe(1);
    expect(waterCells(layout).length).toBeGreaterThan(0);
  });

  it('runs each channel along itself to the cell of it nearest a basin, and out of that towards the basin', () => {
    let outlets = 0;
    for (const gridType of GRIDS) {
      for (const seed of SEEDS) {
        const layout = generateDungeon({ atmosphere: 'sewer', roomCount: 8, seed, gridType });
        const { kinds, flow } = layout.waterway!;
        const distance = walkFromBasins(layout);
        const channel = (index: number) => runs(kinds[index]);
        for (const start of waterCells(layout).filter(channel)) {
          const visited = new Set<number>();
          let at = start;
          for (;;) {
            visited.add(at);
            const step = STEPS.find(([, , heading]) => heading === flow[at]);
            expect(step).toBeDefined();
            const next = (Math.floor(at / layout.width) + step![1]) * layout.width + (at % layout.width) + step![0];
            if (!channel(next)) {
              expect(distance[next]).toBe(distance[at] - 1);
              const run = runOf(layout, at);
              expect(Math.min(...run.map((index) => distance[index]))).toBe(distance[at]);
              expect(run).toContain(start);
              outlets++;
              break;
            }
            expect(visited.has(next)).toBe(false);
            at = next;
          }
        }
      }
    }
    expect(outlets).toBeGreaterThan(0);
  });

  it('lets the water of a basin lie still', () => {
    const layout = generateDungeon({ atmosphere: 'sewer', roomCount: 8, seed: 7 });
    const { kinds, flow } = layout.waterway!;
    const basin = waterCells(layout).filter((index) => kinds[index] === WaterwayKind.Basin);

    expect(basin.length).toBeGreaterThan(0);
    expect(basin.every((index) => flow[index] === -1)).toBe(true);
  });

  it('cuts the last cells of a channel before it drains as deep as a basin, for the channel to fall into over a weir', () => {
    let weirs = 0;
    for (const gridType of GRIDS) {
      for (const seed of SEEDS) {
        const layout = generateDungeon({ atmosphere: 'sewer', roomCount: 8, seed, gridType });
        const { kinds, flow } = layout.waterway!;
        for (const index of waterCells(layout)) {
          if (kinds[index] !== WaterwayKind.Channel) continue;
          const step = STEPS.find(([, , heading]) => heading === flow[index])!;
          const next = (Math.floor(index / layout.width) + step[1]) * layout.width + (index % layout.width) + step[0];
          if (kinds[next] !== WaterwayKind.Outfall) continue;
          let length = 0;
          for (let at = next; kinds[at] === WaterwayKind.Outfall; length++) {
            const on = STEPS.find(([, , heading]) => heading === flow[at])!;
            at = (Math.floor(at / layout.width) + on[1]) * layout.width + (at % layout.width) + on[0];
          }

          expect(length).toBe(PLAN.outfallCells);
          expect(PLAN.channel.surface - PLAN.basin.surface).toBeGreaterThanOrEqual(0.25);
          weirs++;
        }
      }
    }
    expect(weirs).toBeGreaterThan(0);
  });

  it('leaves a run of channel no longer than its outfall would be level, with no weir in it', () => {
    const width = 9;
    const cells = new Uint8Array(width * 7).fill(DungeonCell.Rock);
    for (let y = 1; y < 6; y++) cells.fill(DungeonCell.Corridor, y * width + 1, y * width + width - 1);
    const layout: DungeonLayout = {
      width,
      height: 7,
      cells,
      rooms: [],
      doors: [],
      doorLeaves: [],
      links: [],
      entrance: { x: 1, y: 1 },
      exit: { x: 7, y: 5 },
      mouth: null,
      keyRoomIndex: -1,
      seed: 1,
    };

    cutWaterways(layout, { ...PLAN, outfallCells: 10 });

    const kinds = Array.from(layout.waterway!.kinds);
    expect(kinds).toContain(WaterwayKind.Channel);
    expect(kinds).not.toContain(WaterwayKind.Outfall);
  });

  it('sinks a basin in the largest room that is neither the way in nor the way out, where no room plays a part the plan names', () => {
    for (const gridType of GRIDS) {
      for (const seed of SEEDS) {
        const layout = generateDungeon({ atmosphere: 'sewer', roomCount: 3, seed, gridType });
        const basins = waterCells(layout).filter((index) => layout.waterway!.kinds[index] === WaterwayKind.Basin);
        const holds = (room: (typeof layout.rooms)[number], x: number, y: number) =>
          x >= room.x && y >= room.y && x < room.x + room.w && y < room.y + room.h;

        expect(basins.length).toBeGreaterThan(0);
        for (const index of basins) {
          const room = layout.rooms.find((each) =>
            holds(each, index % layout.width, Math.floor(index / layout.width))
          )!;
          if (PLAN.basinRoles.includes(room.role)) continue;
          expect(holds(room, layout.entrance.x, layout.entrance.y)).toBe(false);
          expect(holds(room, layout.exit.x, layout.exit.y)).toBe(false);
        }
      }
    }
  });

  it('pours a pipe into each basin out of the wall at the middle of its two long sides, the water let in under it', () => {
    let pipes = 0;
    for (const seed of SEEDS) {
      const layout = generateDungeon({ atmosphere: 'sewer', roomCount: 8, seed });
      for (const room of layout.rooms) {
        const inRoom = (layout.spouts ?? []).filter(
          (spout) => spout.x >= room.x && spout.y >= room.y && spout.x < room.x + room.w && spout.y < room.y + room.h
        );
        expect(inRoom.length).toBeLessThanOrEqual(2);
      }
      for (const spout of layout.spouts ?? []) expect([0, 90, 180, 270]).toContain(spout.facing);
      for (const { at, before, behind } of spoutCells(layout)) {
        expect(layout.waterway!.kinds[at]).toBe(WaterwayKind.Basin);
        expect(layout.waterway!.kinds[before]).toBe(WaterwayKind.Basin);
        expect(layout.cells[behind]).toBe(DungeonCell.Rock);
        pipes++;
      }
    }
    expect(pipes).toBeGreaterThan(0);
  });

  it('cuts no channel through a passage too narrow for walkways either side, and still lays out the rest', () => {
    for (const width of [1, 2]) {
      for (const gridType of GRIDS) {
        const plan = planDungeon({
          atmosphere: 'sewer',
          roomCount: 8,
          seed: 7,
          gridType,
          corridorWidth: { least: width, most: width },
        });
        const kinds = plan.layout.waterway!.kinds;

        expect(kinds.some((kind) => kind === WaterwayKind.Channel)).toBe(false);
        expect(kinds.some((kind) => kind === WaterwayKind.Basin)).toBe(true);
        expect(dryReach(plan.layout).reached).toBe(dryReach(plan.layout).floor);
        expect(plan.layout.relief).toBeTruthy();
        expect(plan.blocks.blocks.length).toBeLessThanOrEqual(MAP_MAX_TERRAINS);
      }
    }
  });

  it('gives back the same water and the same ground for the same request', () => {
    for (const gridType of GRIDS) {
      const first = generateDungeon({ atmosphere: 'sewer', roomCount: 8, seed: 55, gridType });
      const second = generateDungeon({ atmosphere: 'sewer', roomCount: 8, seed: 55, gridType });

      expect(Array.from(second.cells)).toEqual(Array.from(first.cells));
      expect(Array.from(second.waterway!.flow)).toEqual(Array.from(first.waterway!.flow));
      expect(second.spouts).toEqual(first.spouts);
      expect(Array.from(second.relief!.heights)).toEqual(Array.from(first.relief!.heights));
    }
  });
});

describe('reliefOfWaterways()', () => {
  function sample(layout: DungeonLayout, column: number, row: number): number {
    return layout.relief!.heights[row * layout.relief!.columns + column];
  }

  it('raises the floor to the walkway and digs the bed of each kind of water down under it', () => {
    const layout = generateDungeon({ atmosphere: 'sewer', roomCount: 8, seed: 7 });
    const kinds = layout.waterway!.kinds;
    const bedOf = {
      [WaterwayKind.Dry]: PLAN.walkway,
      [WaterwayKind.Channel]: PLAN.channel.bed,
      [WaterwayKind.Basin]: PLAN.basin.bed,
      [WaterwayKind.Outfall]: PLAN.basin.bed,
    };

    for (let y = 0; y < layout.height; y++) {
      for (let x = 0; x < layout.width; x++) {
        expect(sample(layout, 2 * x + 1, 2 * y + 1)).toBeCloseTo(
          bedOf[kinds[y * layout.width + x] as 0 | 1 | 2 | 3],
          5
        );
      }
    }
  });

  it('slopes each bank down inside the water’s own cells, the floor beside it lying level', () => {
    const layout = generateDungeon({ atmosphere: 'sewer', roomCount: 8, seed: 7 });
    let banks = 0;

    for (const index of waterCells(layout)) {
      const x = index % layout.width;
      const y = Math.floor(index / layout.width);
      for (const [dx, dy] of STEPS) {
        if (cellAt(layout, x + dx, y + dy) === DungeonCell.Water) continue;
        expect(sample(layout, 2 * x + 1 + dx, 2 * y + 1 + dy)).toBe(PLAN.walkway);
        banks++;
      }
    }
    expect(banks).toBeGreaterThan(0);
  });

  it('keeps the ground under stone at the walkway even where water comes right up to it, on hexes as on squares', () => {
    for (const gridType of GRIDS) {
      const width = 9;
      const pillar = 4 * width + 4;
      const cells = new Uint8Array(width * width).fill(DungeonCell.Rock);
      for (let y = 1; y < width - 1; y++) cells.fill(DungeonCell.Corridor, y * width + 1, y * width + width - 1);
      cells[pillar] = DungeonCell.Rock;
      const kinds = new Uint8Array(cells.length);
      for (const [dx, dy] of AROUND) {
        cells[pillar + dy * width + dx] = DungeonCell.Water;
        kinds[pillar + dy * width + dx] = WaterwayKind.Channel;
      }
      const layout: DungeonLayout = {
        width,
        height: width,
        cells,
        rooms: [],
        doors: [],
        doorLeaves: [],
        links: [],
        entrance: { x: 7, y: 7 },
        exit: { x: 7, y: 7 },
        mouth: null,
        keyRoomIndex: -1,
        waterway: { kinds, flow: new Int16Array(cells.length).fill(-1) },
        seed: 1,
      };

      const relief = reliefOfWaterways(layout, PLAN, gridType);
      const ground = groundSurfaceOf(groundChunksOfRaster(relief));

      expect(Math.min(...relief.heights)).toBeCloseTo(PLAN.channel.bed, 5);
      for (let y = 0; y < width; y++) {
        for (let x = 0; x < width; x++) {
          if (cells[y * width + x] !== DungeonCell.Rock) continue;
          const at = blockOrigin({ x, y, w: 1, h: 1 }, { type: gridType, sizePx: 1 });
          if (at.x < 0 || at.y < 0) continue;
          expect(lowestGroundPxIn(ground, 1, at.x, at.y, 1, 1)).toBe(PLAN.walkway);
        }
      }
    }
  });

  it('lets nothing that stands on the ground down into the water, a pipe over a basin alone standing in it', () => {
    for (const gridType of GRIDS) {
      let pipesInWater = 0;
      for (const seed of SEEDS) {
        const plan = planDungeon({ atmosphere: 'sewer', roomCount: 10, seed, gridType });
        const ground = groundSurfaceOf(groundChunksOfRaster(plan.layout.relief!));
        for (const block of plan.blocks.blocks) {
          const at = blockOrigin(block.rect, { type: gridType, sizePx: 1 });
          if (at.x < 0 || at.y < 0) continue;
          const lowest = lowestGroundPxIn(ground, 1, at.x, at.y, block.rect.w, block.rect.h);
          if (block.thing === 'drainPipe') {
            if (lowest < PLAN.walkway) pipesInWater++;
            continue;
          }
          expect(lowest).toBe(PLAN.walkway);
        }
      }
      expect(pipesInWater).toBeGreaterThan(0);
    }
  });
});

describe('a sewer laid on the table', () => {
  it('lays its water over exactly the cells under water, no area over another', () => {
    for (const gridType of GRIDS) {
      for (const seed of SEEDS) {
        const plan = planDungeon({ atmosphere: 'sewer', roomCount: 8, seed, gridType });
        const wet = new Set(waterCells(plan.layout));
        const waters = plan.blocks.ambiences.filter((ambience) => ambience.water);
        for (const rects of [
          waters.map((water) => water.rect),
          plan.blocks.slows!.map((slow) => slow.rect),
          plan.blocks.harms!.map((harm) => harm.rect),
        ]) {
          const cover = coverOf(plan.layout, rects);
          cover.forEach((count, index) => expect(count).toBe(wet.has(index) ? 1 : 0));
        }
      }
    }
  });

  it('lays a channel and its outfall running the way their cells run and a basin lying still, each at the surface of its kind', () => {
    for (const gridType of GRIDS) {
      const plan = planDungeon({ atmosphere: 'sewer', roomCount: 8, seed: 7, gridType });
      const { kinds, flow } = plan.layout.waterway!;
      for (const ambience of plan.blocks.ambiences.filter((each) => each.water)) {
        const { x, y } = ambience.rect;
        const index = y * plan.layout.width + x;
        const water = ambience.water!;
        for (let dy = 0; dy < ambience.rect.h; dy++) {
          for (let dx = 0; dx < ambience.rect.w; dx++) {
            const cell = (y + dy) * plan.layout.width + x + dx;
            expect(kinds[cell]).toBe(kinds[index]);
            expect(flow[cell]).toBe(flow[index]);
          }
        }
        expect(water.color).toBe(PLAN.look.color);
        expect(water.turbidity).toBe(PLAN.look.turbidity);
        const low = kinds[index] !== WaterwayKind.Channel;
        expect(water.surface).toBe(low ? PLAN.basin.surface : PLAN.channel.surface);
        if (kinds[index] === WaterwayKind.Basin) {
          expect(water.flowSpeed).toBe(0);
        } else {
          expect(water.flowSpeed).toBe(PLAN.flowSpeed);
          expect(water.flowDirection).toBe(flow[index]);
        }
      }
    }
  });

  it('paints the floor under the water, so that no hole shows through it', () => {
    const plan = planDungeon({ atmosphere: 'sewer', roomCount: 8, seed: 7 });
    const floor = coverOf(
      plan.layout,
      plan.blocks.paint.filter((patch) => patch.kind === 'floor').map((patch) => patch.rect)
    );

    for (const index of waterCells(plan.layout)) expect(floor[index]).toBe(1);
  });

  it('charges a step more to wade it and poisons whoever starts a turn in it', () => {
    const plan = planDungeon({ atmosphere: 'sewer', roomCount: 8, seed: 7 });

    expect(plan.blocks.slows!.every((slow) => slow.extraCost === 1)).toBe(true);
    expect(
      plan.blocks.harms!.every(
        (harm) =>
          harm.thing === 'sewage' && harm.moment === 'turnStart' && harm.ailment === '毒' && harm.amount.length > 0
      )
    ).toBe(true);
  });

  it('stands a pipe where one pours in, a box set back against its wall and lifted out of the water let in under it', () => {
    const plan = planDungeon({ atmosphere: 'sewer', roomCount: 8, seed: 7 });
    const pipes = plan.blocks.blocks.filter((block) => block.thing === 'drainPipe');

    expect(pipes.length).toBe(plan.layout.spouts!.length);
    expect(pipes.length).toBeGreaterThan(0);
    pipes.forEach((pipe, index) => {
      const spout = plan.layout.spouts![index];
      const turn = (spout.facing * Math.PI) / 180;
      const away = { x: Math.round(Math.cos(turn)), y: Math.round(Math.sin(turn)) };

      expect(pipe.kind).toBe('prop');
      expect(pipe.rect).toEqual({ x: spout.x, y: spout.y, w: 1, h: 1 });
      expect(pipe.blocksSight).toBe(false);
      expect(pipe.blocksClimb).toBe(false);
      expect(pipe.height).toBeCloseTo(SEWER.wallHeight * 0.6, 6);
      expect(away.x === 0 ? pipe.footprint : { w: pipe.footprint!.d, d: pipe.footprint!.w }).toEqual({ w: 1, d: 0.4 });
      expect(pipe.offset!.x * away.x + pipe.offset!.y * away.y).toBeCloseTo(-0.3, 6);
      expect(pipe.altitude).toBeCloseTo((PLAN.walkway - PLAN.basin.bed) * 0.8, 6);
      expect(pipe.model).toBeUndefined();
    });
  });

  it('stands the pipe as its model where models are asked for, filling its cell with its mouth turned out over the water', () => {
    const plan = planDungeon(
      { atmosphere: 'sewer', roomCount: 8, seed: 7 },
      { ...DEFAULT_BLOCK_OPTIONS, models: true }
    );
    const pipes = plan.blocks.blocks.filter((block) => block.thing === 'drainPipe');

    expect(pipes.length).toBeGreaterThan(0);
    pipes.forEach((pipe, index) => {
      const spout = plan.layout.spouts![index];

      expect(pipe.model).toBe('prop_drainPipe');
      expect(pipe.modelTurn).toBe((spout.facing + 270) % 360);
      expect(pipe.rect).toEqual({ x: spout.x, y: spout.y, w: 1, h: 1 });
      expect(pipe.footprint).toBeUndefined();
      expect(pipe.offset).toBeUndefined();
      expect(pipe.height).toBeGreaterThanOrEqual(2);
      expect(pipe.altitude).toBe(PLAN.walkway - PLAN.basin.bed);
    });
  });

  it('stays within what a table will carry, its water as well as its terrain', () => {
    for (const gridType of GRIDS) {
      for (const roomCount of [3, 8, 20]) {
        for (const seed of [1, 42, 777, 1234]) {
          const plan = planDungeon({ atmosphere: 'sewer', roomCount, seed, gridType });

          expect(plan.blocks.blocks.length).toBeLessThanOrEqual(MAP_MAX_TERRAINS);
          expect(plan.blocks.ambiences.length).toBeLessThanOrEqual(MOST_WATER_AREAS);
          expect(plan.blocks.slows!.length).toBeLessThanOrEqual(MOST_WATER_AREAS);
          expect(plan.blocks.harms!.length).toBeLessThanOrEqual(MOST_WATER_AREAS);
        }
      }
    }
  });

  it('draws its ways up and down as the place asks, and as stairs where it asks for nothing', () => {
    const plan = planDungeon({ atmosphere: 'sewer', roomCount: 8, seed: 7 });
    const props = (blocks: typeof plan.blocks.blocks) =>
      blocks.filter((block) => block.kind.startsWith('stair')).map((block) => block.prop);
    const spiral = layoutToBlocks(plan.layout, { ...SEWER, stairs: { up: 'stair_spiral', down: 'stair_down' } });
    const plain = layoutToBlocks(plan.layout, { ...SEWER, stairs: undefined });

    expect(props(plan.blocks.blocks)).toEqual(['ladder_up', 'stair_down']);
    expect(props(spiral.blocks)).toEqual(['stair_spiral', 'stair_down']);
    expect(props(plain.blocks)).toEqual(['stair_up', 'stair_down']);
  });

  it('lays no water, no slow ground and no harm in a place with none run through it', () => {
    const plan = planDungeon({ atmosphere: 'stoneDungeon', roomCount: 8, seed: 7 });

    expect(plan.layout.waterway).toBeUndefined();
    expect(plan.layout.relief).toBeUndefined();
    expect(plan.blocks.ambiences).toEqual([]);
    expect(plan.blocks.slows).toBeUndefined();
    expect(plan.blocks.harms).toBeUndefined();
  });
});
