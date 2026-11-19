import { clamp } from '@axe/core/util/clamp';
import { hexChannels } from '@axe/core/util/hex-color';
import { type CellGrid, cellPolygonOf } from '@axe/domain/tabletop/fog/cell-grid';
import { standsWet, type WaterCell } from '@axe/domain/tabletop/water/water-cells';
import { depthShadeAlpha } from '@axe/domain/tabletop/water/water-depth';
import type { FallingWater, WaterColumn, WaterFall } from '@axe/domain/tabletop/water/water-falls';
import { flowCellsPerSecond, flowVectorOf } from '@axe/domain/tabletop/water/water-flow';
import {
  causticOpacity,
  deepWaterColor,
  dirtyWaterColor,
  floorWashAlpha,
  flowStreakOpacity,
  frozenOver,
  glintOpacity,
  murkAlpha,
  murkColorOf,
  scumColorOf,
  scumOpacity,
  scumRimColorOf,
  siltColorOf,
  siltOpacity,
  surfaceWashAlpha,
  underwaterDeepColor,
  waterSideAlphas,
} from '@axe/domain/tabletop/water/water-look';
import type { WaterShore } from '@axe/domain/tabletop/water/water-shore';
import type { WaterSide } from '@axe/domain/tabletop/water/water-sides';

/**
 * One part of the water as the scene draws it: triangles, three points each, every point in table
 * pixels (x to the east, y to the south, z up), with its colour in sRGB and how opaque it is, and
 * one more figure a point that the part reads its own way.
 */
export interface WaterPart {
  readonly points: Float32Array;
  /** Red, green, blue and alpha, from 0 to 1, four to a point. */
  readonly colours: Float32Array;
  /**
   * For the surface, how strongly the sky glints on it; for the floor, how strongly the net of light
   * shows; for the shore, how far out from the land, from 0 to 1; for falling water, how far down
   * from where it leaves, in cells; for the foam where it leaves, how far back from the edge, and for
   * the rings where it lands, how far out, each from 0 to 1.
   */
  readonly extra: Float32Array;
}

/** The water on a table as the scene draws it, every part empty where there is none. */
export interface TableWorldWater {
  /** The surfaces, coloured cell by cell as the ground falls away under them, smoothly from cell to cell. */
  readonly surface: WaterPart;
  /** Which way and how fast the surface flows at each point, in cells a second, two to a point. */
  readonly flow: Float32Array;
  /**
   * The scum floating on the surface at each point, eight to a point: the colour of the scum in sRGB
   * and how thick it floats, then the colour of the rim along its patches and how strongly it shows.
   */
  readonly scum: Float32Array;
  /**
   * The clouds of silt in murky water at each point, four to a point: their colour in sRGB and how
   * strongly they show.
   */
  readonly silt: Float32Array;
  /** How strongly the streaks of a current show at each point, one to a point: none on still water. */
  readonly streaks: Float32Array;
  /** How much of the surface is frozen at each point, one to a point, from 0 for open water to 1 for ice. */
  readonly ice: Float32Array;
  /** The leaves floating on the surface, a part for each amount of the water they cover. */
  readonly leaves: readonly TableWorldLeaves[];
  /** The floors under water lying on its own level floor, darkened, which the net of light crosses. */
  readonly floor: WaterPart;
  /** The sides that show where the water stands over lower ground or the board's edge. */
  readonly sides: WaterPart;
  /** The strips along the shore the waves break on, reaching out into the water. */
  readonly shore: WaterPart;
  /**
   * The water falling: a sheet over each edge it goes over onto lower water, and a column from each
   * spout, leaning out the way the water is thrown.
   */
  readonly falls: WaterPart;
  /**
   * Where each point of the falling water is across its sheet and how far the whole of it falls,
   * both in cells, two to a point.
   */
  readonly fallAt: Float32Array;
  /** The foam on the surface the water leaves, a strip back from each edge it falls over. */
  readonly lips: WaterPart;
  /** The foam and the rings spreading where falling water lands, lying on what it lands on. */
  readonly splashes: WaterPart;
  /**
   * The floor of a table whose whole map is under water, laid over the whole board, or null where
   * the map is not under water.
   */
  readonly seaFloor: TableWorldSeaFloor | null;
  /** How big a cell is, which the waves and the net of light are measured by. */
  readonly cellPx: number;
  /** Whether the water moves, which it does not for a reader who asks for less motion, nor where it is all frozen over. */
  readonly moving: boolean;
}

/**
 * The leaves floating over the cells of water that carry so much of them, from 0 to 1, laid a hair
 * over the surface, and which way and how fast they are carried along, in cells a second, two to a
 * point.
 */
export interface TableWorldLeaves {
  readonly amount: number;
  readonly part: WaterPart;
  readonly flow: Float32Array;
}

/** The floor of a table whose whole map is under water: darkened, and crossed by the net of light the surface far overhead throws. */
export interface TableWorldSeaFloor {
  /** The colour of the depths laid over it, red, green, blue and alpha from 0 to 1, in sRGB. */
  readonly colour: readonly [number, number, number, number];
  /** How strongly the net of light shows on it. */
  readonly net: number;
}

/** No water at all. */
export const NO_WATER: TableWorldWater = {
  surface: emptyPart(),
  flow: new Float32Array(0),
  scum: new Float32Array(0),
  silt: new Float32Array(0),
  streaks: new Float32Array(0),
  ice: new Float32Array(0),
  leaves: [],
  floor: emptyPart(),
  sides: emptyPart(),
  shore: emptyPart(),
  falls: emptyPart(),
  fallAt: new Float32Array(0),
  lips: emptyPart(),
  splashes: emptyPart(),
  seaFloor: null,
  cellPx: 50,
  moving: false,
};

/** How far over its floor the floor of the water is laid, as the page lifts it: over the board, under the grid. */
const FLOOR_LIFT_PX = 0.13;
/** How far over the floor a surface standing no higher than the floor is laid. */
const FLAT_SURFACE_LIFT_PX = 0.17;
/** How far over the surface the waves breaking on the shore are laid. */
const SHORE_LIFT_PX = 0.4;
/** How far over the surface the floating leaves are laid. */
const LEAF_LIFT_PX = 0.2;
/** How strongly the rim of the scum shows beside the scum itself, as the page lays it. */
const SCUM_RIM_SHARE = 0.8;
/** How far out from the shore the waves run in from, in cells. */
const SHORE_REACH_CELLS = 0.7;
/**
 * How far over the land the waves run on, in cells: over the cell of land the surface is carried on
 * over, so they break where its ground comes up through the surface and hides them.
 */
const SHORE_LAND_CELLS = 1;
/** How far out from the edge it leaves a sheet of falling water lands, in cells, thrown as it goes over. */
const FALL_THROW_CELLS = 0.15;
/** How far back from the edge the foam gathers on the surface the water leaves, in cells. */
const LIP_REACH_CELLS = 0.55;
/** How far out the rings spread from where a sheet lands, and how far back under it they start, in cells. */
const SPLASH_REACH_CELLS = 1.15;
const SPLASH_BACK_CELLS = 0.15;
/** How far out the rings spread round where a column lands on water, and on the ground, in cells. */
const COLUMN_SPLASH_CELLS = 0.75;
const COLUMN_PUDDLE_CELLS = 0.38;
/** How many sides the rings round a column are drawn with. */
const COLUMN_SPLASH_SIDES = 12;
/** How much of falling water is white with the air in it, over the colour of the water it left, and how opaque it is. */
const FALL_WHITE_SHARE = 0.5;
const FALL_ALPHA = 0.86;

/** Nothing falling. */
const NOTHING_FALLING: { readonly falls: readonly WaterFall[]; readonly columns: readonly WaterColumn[] } = {
  falls: [],
  columns: [],
};

/**
 * How much fainter the net is on the floor of a map under water than under a pond, laid over every
 * cell of the board at once: half what the page lays, so that it reads as faintly as the page's net
 * does under the tint the page lays over the whole table.
 */
const SEA_FLOOR_NET_SHARE = 0.35;

/**
 * The water on a table, made into triangles for the scene from the cells under water and the sides
 * and shores they show, as the page draws them: the surface over the depths, the depths gathering as
 * the bottom falls away, the murk over both and the surface's own colour over all, each laid in the
 * colour the dirt turns the water.
 */
export function tableWaterOf(
  grid: CellGrid | null,
  cells: ReadonlyMap<number, WaterCell>,
  sides: readonly WaterSide[],
  shores: readonly WaterShore[],
  moving: boolean,
  underwater: { readonly color: string; readonly density: number } | null = null,
  falling: { readonly falls: readonly WaterFall[]; readonly columns: readonly WaterColumn[] } = NOTHING_FALLING
): TableWorldWater {
  const seaFloor = underwater ? seaFloorOf(underwater.color, underwater.density) : null;
  if (!grid || (cells.size < 1 && falling.columns.length < 1)) {
    return { ...NO_WATER, seaFloor, cellPx: grid?.sizePx || NO_WATER.cellPx, moving };
  }
  const stillAsIce =
    !underwater && falling.columns.length < 1 && [...cells.values()].every((cell) => (cell.ice ?? 0) >= 1);
  const cellPx = Math.max(grid.sizePx, 1);
  const depthAt = depthsAtCorners(grid, cells, cellPx);
  const surface = new PartBuilder();
  const flow: number[] = [];
  const scum: number[] = [];
  const silt: number[] = [];
  const streaks: number[] = [];
  const ice: number[] = [];
  const leaves = new Map<number, { part: PartBuilder; flow: number[] }>();
  const floor = new PartBuilder();
  const ashore = shorelandOf(shores, cells);
  const fallen = new Set(falling.falls.map((fall) => fall.key));
  for (const cell of [...cells.values(), ...ashore.values()]) {
    const land = ashore.get(cell.index) === cell;
    const outline = cellPolygonOf(grid, cell.index);
    const tone = dirtyWaterColor(cell.color, cell.dirt);
    const deep = channelsOf(deepWaterColor(tone));
    const wash = channelsOf(tone);
    const murk = channelsOf(murkColorOf(tone));
    const surfaceZ = standsWet(cell) ? cell.surfacePx : cell.floorPx + FLAT_SURFACE_LIFT_PX;
    const frozen = clamp(cell.ice ?? 0, 0, 1);
    const open = 1 - frozen;
    const glint = glintOpacity(cell.density, cell.turbidity, cell.dirt) * open;
    const stream = flowVectorOf(cell.flowDirection);
    const speed = cell.flowSpeed > 0 ? flowCellsPerSecond(cell.flowSpeed) * open : 0;
    const shade = (x: number, y: number) =>
      frozenOver(
        over(
          [...wash, surfaceWashAlpha(cell.density)],
          over(
            [...murk, murkAlpha(cell.turbidity)],
            [
              ...deep,
              depthShadeAlpha(depthAt(x, y) ?? (land ? 0 : (cell.surfacePx - cell.floorPx) / cellPx), cell.turbidity),
            ]
          )
        ),
        frozen
      );
    const thick = scumOpacity(cell.dirt);
    const scumOf = [
      ...channelsOf(scumColorOf(cell.color)),
      thick,
      ...channelsOf(scumRimColorOf(cell.color)),
      thick * SCUM_RIM_SHARE,
    ];
    const siltOf = [...channelsOf(siltColorOf(tone)), siltOpacity(cell.turbidity)];
    const streak = speed > 0 ? flowStreakOpacity(cell.flowSpeed, cell.turbidity) * open : 0;
    fan(outline, (point) => {
      surface.add(point.x, point.y, surfaceZ, shade(point.x, point.y), glint);
      flow.push(stream.x * speed, stream.y * speed);
      scum.push(...scumOf);
      silt.push(...siltOf);
      streaks.push(streak);
      ice.push(frozen);
    });
    if (land) continue;
    if (cell.leaves > 0) {
      const floating = leaves.get(cell.leaves) ?? { part: new PartBuilder(), flow: [] };
      leaves.set(cell.leaves, floating);
      fan(outline, (point) => {
        floating.part.add(point.x, point.y, surfaceZ + LEAF_LIFT_PX, WHITE, 0);
        floating.flow.push(stream.x * speed, stream.y * speed);
      });
    }
    if (!cell.flat) continue;
    const floorColour = [...deep, floorWashAlpha(cell.density)] as Rgba;
    const net = causticOpacity(cell.density, cell.turbidity, (cell.surfacePx - cell.floorPx) / cellPx) * open;
    fan(outline, (point) => floor.add(point.x, point.y, cell.floorPx + FLOOR_LIFT_PX, floorColour, net));
  }
  return {
    surface: surface.part(),
    flow: new Float32Array(flow),
    scum: new Float32Array(scum),
    silt: new Float32Array(silt),
    streaks: new Float32Array(streaks),
    ice: new Float32Array(ice),
    leaves: [...leaves].map(([amount, floating]) => ({
      amount,
      part: floating.part.part(),
      flow: new Float32Array(floating.flow),
    })),
    floor: floor.part(),
    sides: sidesOf(
      sides.filter((side) => !fallen.has(side.key)),
      cells
    ),
    shore: shoreOf(
      shores.filter((shore) => (cells.get(shore.index)?.ice ?? 0) < 0.5),
      cellPx
    ),
    ...fallingOf(falling.falls, falling.columns, cellPx),
    seaFloor,
    cellPx,
    moving: moving && !stillAsIce,
  };
}

type Rgba = [number, number, number, number];

const WHITE: Rgba = [1, 1, 1, 1];

/** The floor of a map under water, from the colour chosen for the light coming down and how thick the water is drawn. */
function seaFloorOf(color: string, density: number): TableWorldSeaFloor {
  return {
    colour: [...channelsOf(underwaterDeepColor(color)), floorWashAlpha(density)],
    net: Math.round(causticOpacity(density) * SEA_FLOOR_NET_SHARE * 1000) / 1000,
  };
}

/**
 * How deep the water is at each corner of the cells, in cells, the mean of the cells of water that
 * meet there, so the colour of the depths runs smoothly from one cell to the next.
 */
function depthsAtCorners(
  grid: CellGrid,
  cells: ReadonlyMap<number, WaterCell>,
  cellPx: number
): (x: number, y: number) => number | undefined {
  const sums = new Map<string, { depth: number; count: number }>();
  for (const cell of cells.values()) {
    const depth = Math.max(0, cell.surfacePx - cell.floorPx) / cellPx;
    for (const point of cellPolygonOf(grid, cell.index)) {
      const key = cornerKey(point.x, point.y);
      const sum = sums.get(key) ?? { depth: 0, count: 0 };
      sum.depth += depth;
      sum.count++;
      sums.set(key, sum);
    }
  }
  return (x, y) => {
    const sum = sums.get(cornerKey(x, y));
    return sum ? sum.depth / sum.count : undefined;
  };
}

function cornerKey(x: number, y: number): string {
  return `${Math.round(x * 10)},${Math.round(y * 10)}`;
}

/**
 * The land along the shore, which the surface of the water beside it is carried on over, as that
 * water: the ground hides the surface wherever it stands above it, so the water ends where the ground
 * comes up through the surface rather than square along the side of a cell, and where the ground of a
 * cell of land dips below the surface, the water fills the dip. The surface stands no depth of water
 * on it but where it meets the water's own cells, and takes the highest water beside it.
 */
function shorelandOf(shores: readonly WaterShore[], cells: ReadonlyMap<number, WaterCell>): Map<number, WaterCell> {
  const land = new Map<number, WaterCell>();
  for (const shore of shores) {
    const water = cells.get(shore.index);
    if (!water || cells.has(shore.across)) continue;
    const held = land.get(shore.across);
    if (held && held.surfacePx >= water.surfacePx) continue;
    land.set(shore.across, { ...water, index: shore.across });
  }
  return land;
}

/** The sides as upright faces, each from its bottom to the surface, its colour laid down from the surface to the water's floor. */
function sidesOf(sides: readonly WaterSide[], cells: ReadonlyMap<number, WaterCell>): WaterPart {
  const part = new PartBuilder();
  for (const side of sides) {
    const cell = cells.get(side.index);
    const tone = dirtyWaterColor(side.color, cell?.dirt ?? 0);
    const alphas = waterSideAlphas(side.density, cell?.turbidity ?? 0);
    const frozen = cell?.ice ?? 0;
    const bottom = frozenOver([...channelsOf(deepWaterColor(tone)), alphas.bottom], frozen * 0.5);
    const top = frozenOver([...channelsOf(tone), alphas.top], frozen);
    const reach = Math.max(side.topPx - side.floorPx, side.topPx - side.bottomPx, 1);
    const at = (heightPx: number) => blend(bottom, top, 1 - (side.topPx - heightPx) / reach);
    const corners = [
      { x: side.x0, y: side.y0, z: side.bottomStartPx },
      { x: side.x1, y: side.y1, z: side.bottomEndPx },
      { x: side.x1, y: side.y1, z: side.topPx },
      { x: side.x0, y: side.y0, z: side.topPx },
    ];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const corner = corners[index];
      part.add(corner.x, corner.y, corner.z, at(corner.z), 0);
    }
  }
  return part.part();
}

/**
 * The strips along the shore, each lying on the surface along one side of a cell, reaching out into
 * the water, which lies to the right of the way the side runs, and back over the land the surface is
 * carried on over: the waves run in over the strip until the ground rising through the surface hides
 * them.
 */
function shoreOf(shores: readonly WaterShore[], cellPx: number): WaterPart {
  const part = new PartBuilder();
  for (const shore of shores) {
    const length = Math.hypot(shore.x1 - shore.x0, shore.y1 - shore.y0);
    if (length <= 0) continue;
    const inward = { x: -(shore.y1 - shore.y0) / length, y: (shore.x1 - shore.x0) / length };
    const out = { x: inward.x * cellPx * SHORE_REACH_CELLS, y: inward.y * cellPx * SHORE_REACH_CELLS };
    const on = { x: -inward.x * cellPx * SHORE_LAND_CELLS, y: -inward.y * cellPx * SHORE_LAND_CELLS };
    const z = shore.surfacePx + SHORE_LIFT_PX;
    const corners = [
      { x: shore.x0 + on.x, y: shore.y0 + on.y, away: 0 },
      { x: shore.x1 + on.x, y: shore.y1 + on.y, away: 0 },
      { x: shore.x1 + out.x, y: shore.y1 + out.y, away: 1 },
      { x: shore.x0 + out.x, y: shore.y0 + out.y, away: 1 },
    ];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const corner = corners[index];
      part.add(corner.x, corner.y, z, WHITE, corner.away);
    }
  }
  return part.part();
}

/**
 * The falling water as the scene draws it. A sheet hangs from the edge it goes over down to where
 * it lands a little way out, with foam on the surface behind the edge and rings spreading from the
 * line it lands along. A column has four faces round the line from its spout to where it lands, and
 * rings spreading round that point.
 */
function fallingOf(
  falls: readonly WaterFall[],
  columns: readonly WaterColumn[],
  cellPx: number
): Pick<TableWorldWater, 'falls' | 'fallAt' | 'lips' | 'splashes'> {
  const sheet = new PartBuilder();
  const at: number[] = [];
  const lips = new PartBuilder();
  const splashes = new PartBuilder();
  const face = (
    from: { x: number; y: number; along: number },
    to: { x: number; y: number; along: number },
    shift: { x: number; y: number },
    topPx: number,
    bottomPx: number,
    colour: Rgba
  ) => {
    const whole = (topPx - bottomPx) / cellPx;
    const corners = [
      { x: from.x, y: from.y, z: topPx, along: from.along, down: 0 },
      { x: to.x, y: to.y, z: topPx, along: to.along, down: 0 },
      { x: to.x + shift.x, y: to.y + shift.y, z: bottomPx, along: to.along, down: whole },
      { x: from.x + shift.x, y: from.y + shift.y, z: bottomPx, along: from.along, down: whole },
    ];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const corner = corners[index];
      sheet.add(corner.x, corner.y, corner.z, colour, corner.down);
      at.push(corner.along, whole);
    }
  };
  const strip = (
    part: PartBuilder,
    from: { x: number; y: number },
    to: { x: number; y: number },
    near: { x: number; y: number },
    far: { x: number; y: number },
    z: number
  ) => {
    const corners = [
      { x: from.x + near.x, y: from.y + near.y, away: 0 },
      { x: to.x + near.x, y: to.y + near.y, away: 0 },
      { x: to.x + far.x, y: to.y + far.y, away: 1 },
      { x: from.x + far.x, y: from.y + far.y, away: 1 },
    ];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const corner = corners[index];
      part.add(corner.x, corner.y, z, WHITE, corner.away);
    }
  };
  for (const fall of falls) {
    const from = { x: fall.x0, y: fall.y0 };
    const to = { x: fall.x1, y: fall.y1 };
    const out = (cells: number) => ({ x: fall.outX * cellPx * cells, y: fall.outY * cellPx * cells });
    const alongOf = (point: { x: number; y: number }) => (point.y * fall.outX - point.x * fall.outY) / cellPx;
    face(
      { ...from, along: alongOf(from) },
      { ...to, along: alongOf(to) },
      out(FALL_THROW_CELLS),
      fall.topPx,
      fall.bottomPx,
      fallColourOf(fall)
    );
    strip(lips, from, to, out(0), out(-LIP_REACH_CELLS), fall.topPx + SHORE_LIFT_PX);
    strip(
      splashes,
      from,
      to,
      out(FALL_THROW_CELLS - SPLASH_BACK_CELLS),
      out(FALL_THROW_CELLS + SPLASH_REACH_CELLS),
      fall.bottomPx + SHORE_LIFT_PX
    );
  }
  for (const column of columns) {
    const colour = fallColourOf(column);
    const shift = { x: column.x - column.fromX, y: column.y - column.fromY };
    const half = column.halfPx;
    const ring = [
      { x: column.fromX - half, y: column.fromY - half },
      { x: column.fromX + half, y: column.fromY - half },
      { x: column.fromX + half, y: column.fromY + half },
      { x: column.fromX - half, y: column.fromY + half },
    ];
    const side = (2 * half) / cellPx;
    ring.forEach((corner, index) => {
      const next = ring[(index + 1) % ring.length];
      face(
        { ...corner, along: index * side },
        { ...next, along: (index + 1) * side },
        shift,
        column.topPx,
        column.bottomPx,
        colour
      );
    });
    const reach = (column.onWater ? COLUMN_SPLASH_CELLS : COLUMN_PUDDLE_CELLS) * cellPx;
    const z = column.bottomPx + SHORE_LIFT_PX;
    for (let index = 0; index < COLUMN_SPLASH_SIDES; index++) {
      const turn = (step: number) => ((index + step) / COLUMN_SPLASH_SIDES) * Math.PI * 2;
      splashes.add(column.x, column.y, z, WHITE, 0);
      splashes.add(column.x + Math.cos(turn(0)) * reach, column.y + Math.sin(turn(0)) * reach, z, WHITE, 1);
      splashes.add(column.x + Math.cos(turn(1)) * reach, column.y + Math.sin(turn(1)) * reach, z, WHITE, 1);
    }
  }
  return { falls: sheet.part(), fallAt: new Float32Array(at), lips: lips.part(), splashes: splashes.part() };
}

/** The colour of falling water: the colour its dirt turns the water it left, whitened by the air in it. */
function fallColourOf(water: FallingWater): Rgba {
  const tone = channelsOf(dirtyWaterColor(water.color, water.dirt));
  return blend([...tone, FALL_ALPHA], [1, 1, 1, FALL_ALPHA], FALL_WHITE_SHARE);
}

/** Calls back for the points of a cell's outline as triangles fanned from its first corner. */
function fan(outline: readonly { x: number; y: number }[], add: (point: { x: number; y: number }) => void): void {
  for (let i = 1; i < outline.length - 1; i++) {
    add(outline[0]);
    add(outline[i]);
    add(outline[i + 1]);
  }
}

/** A colour laid over another, as a page lays one picture over another. */
function over(top: Rgba, under: Rgba): Rgba {
  const alpha = top[3] + under[3] * (1 - top[3]);
  if (alpha <= 0) return [0, 0, 0, 0];
  const channel = (index: number) => (top[index] * top[3] + under[index] * under[3] * (1 - top[3])) / alpha;
  return [channel(0), channel(1), channel(2), alpha];
}

function blend(from: Rgba, to: Rgba, share: number): Rgba {
  const t = clamp(share, 0, 1);
  return from.map((value, index) => value + (to[index] - value) * t) as Rgba;
}

/** A colour's red, green and blue from 0 to 1, black for one that cannot be read. */
function channelsOf(color: string): [number, number, number] {
  const channels = hexChannels(color);
  return channels ? [channels[0] / 255, channels[1] / 255, channels[2] / 255] : [0, 0, 0];
}

class PartBuilder {
  private readonly points: number[] = [];
  private readonly colours: number[] = [];
  private readonly extra: number[] = [];

  add(x: number, y: number, z: number, colour: Rgba, extra: number): void {
    this.points.push(x, y, z);
    this.colours.push(...colour);
    this.extra.push(extra);
  }

  part(): WaterPart {
    return {
      points: new Float32Array(this.points),
      colours: new Float32Array(this.colours),
      extra: new Float32Array(this.extra),
    };
  }
}

function emptyPart(): WaterPart {
  return { points: new Float32Array(0), colours: new Float32Array(0), extra: new Float32Array(0) };
}
