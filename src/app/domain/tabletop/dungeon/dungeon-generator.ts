import { clamp } from '@axe/core/util/clamp';
import { seededRandom } from '@axe/core/util/seeded-random';
import { generateCave } from '@axe/domain/tabletop/dungeon/cave-automata';
import { DoorWidths, hangDoors, hideDoorsOf } from '@axe/domain/tabletop/dungeon/door-hanging';
import {
  atmosphereById,
  CaveShape,
  DungeonAtmosphere,
  DungeonAtmosphereId,
  DungeonEntranceStyle,
  RoomPlan,
} from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import {
  DEFAULT_BLOCK_OPTIONS,
  DungeonBlockOptions,
  layoutToBlocks,
  MAX_MERGE_SPAN,
} from '@axe/domain/tabletop/dungeon/dungeon-blocks';
import { clampCorridorWidth, DungeonLayout } from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { furnishRooms } from '@axe/domain/tabletop/dungeon/room-furnishing';
import { assignRoomRoles, assignRoomSets } from '@axe/domain/tabletop/dungeon/room-roles';
import { fitBoardTo, generateRoomsAndMazes } from '@axe/domain/tabletop/dungeon/rooms-and-mazes';
import { cutWaterways, reliefOfWaterways } from '@axe/domain/tabletop/dungeon/sewer-channels';
import { clampTrapCount, placeTraps } from '@axe/domain/tabletop/dungeon/trap-placing';
import { openTunnelMouth } from '@axe/domain/tabletop/dungeon/tunnel-mouth';
import { GridType } from '@axe/domain/tabletop/game-table';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { MapBlocks } from '@axe/domain/tabletop/map-blocks';
import { boardSizeOn, cellCentre, MapGrid, mergeSpanFor } from '@axe/domain/tabletop/map-grid';

export const MIN_ROOM_COUNT = 3;
export const MAX_ROOM_COUNT = 20;
/** One scratch mask covers at most fifty cells a side, and the whole board wants covering. */
export const MAX_BOARD_WIDTH = 50;
export const MAX_BOARD_HEIGHT = 38;

/** How much larger a round place's board is made than its round alone would take: its rim and the board's corners hold no room. */
const ROUND_SLACK = 1.15;

/**
 * How much smaller a round place's board is made on hexes, and the longest side it is made from there.
 * A board of hexes is made smaller, as every one of its cells is a block of its own; a round place
 * builds nothing outside its round, so it is made only a little smaller, from a side no longer than
 * an oblong board is tall, which keeps its blocks within what a table carries however many rooms are
 * asked for.
 */
const ROUND_HEX_FACTOR = 0.95;
const ROUND_HEX_LONGEST = MAX_BOARD_HEIGHT;
/** A cave merges worse than a set of rooms, so it gets a smaller board for the same count. */
const CAVE_BOARD_SCALE = 0.85;

export interface DungeonRequest {
  atmosphere: DungeonAtmosphereId;
  roomCount: number;
  seed: number;
  /** What shape the cells are. Left out, squares, which is what a dungeon is usually laid on. */
  gridType?: GridType;
  /** Left out, the atmosphere decides how the party gets in. */
  entrance?: DungeonEntranceStyle;
  /** The narrowest and the widest a passage is cut. Left out, the atmosphere decides that too. */
  corridorWidth?: CorridorWidths;
  /** The narrowest and the widest a door is hung. Left out, a door fills one cell. */
  doorWidth?: DoorWidths;
  /** How many doors in a hundred are hung as a pair. Left out, half of those that can be. */
  doubleDoorPercent?: number;
  /** How many traps are set about the place. Left out, none: a dungeon is trapped on request. */
  trapCount?: number;
}

/** How wide a passage may be cut, at its narrowest and at its widest. */
export interface CorridorWidths {
  least: number;
  most: number;
}

export interface DungeonBoardSize {
  width: number;
  height: number;
}

/** A requested room count rounded and kept within what the generator supports; not a number gives the fewest. */
export function clampRoomCount(roomCount: number): number {
  if (!Number.isFinite(roomCount)) return MIN_ROOM_COUNT;
  return clamp(Math.round(roomCount), MIN_ROOM_COUNT, MAX_ROOM_COUNT);
}

/** What an atmosphere digs with: the shape of its cave, or else the plan of its rooms. */
type Digging = { cave: CaveShape; rooms?: undefined } | { cave?: undefined; rooms: RoomPlan };

/** What the atmosphere digs with. Every atmosphere in the catalogue has what its algorithm asks for. */
function diggingOf(atmosphere: DungeonAtmosphere): Digging {
  if (atmosphere.algorithm === 'cave' && atmosphere.cave) return { cave: atmosphere.cave };
  if (atmosphere.rooms) return { rooms: atmosphere.rooms };
  throw new Error(`The ${atmosphere.id} atmosphere has neither a cave shape nor a room plan`);
}

/** How wide a passage this atmosphere cuts when the room has not said otherwise. */
export function defaultCorridorWidth(atmosphere: DungeonAtmosphere): number {
  const digging = diggingOf(atmosphere);
  return clampCorridorWidth(digging.cave ? digging.cave.tunnelWidth : (digging.rooms.corridor ?? 1));
}

/**
 * The widths a passage is cut between, held in order and within what a passage may be.
 *
 * A table that asks for one width asks for it at both ends, and a table that asks for nothing
 * is given whatever the atmosphere has always cut.
 */
export function corridorWidthsFor(atmosphere: DungeonAtmosphere, asked?: CorridorWidths): CorridorWidths {
  const fallback = defaultCorridorWidth(atmosphere);
  const most = clampCorridorWidth(asked?.most ?? fallback);
  const least = Math.min(most, clampCorridorWidth(asked?.least ?? fallback));
  return { least, most };
}

/**
 * How many cells wide and high the board for a dungeon of this many rooms is.
 *
 * A cave gets a smaller board than rooms and mazes, wider passages get a larger one, and neither side goes
 * past the most one scratch mask can cover.
 */
export function boardSizeFor(
  atmosphere: DungeonAtmosphere,
  roomCount: number,
  corridorWidth = defaultCorridorWidth(atmosphere)
): DungeonBoardSize {
  const rooms = clampRoomCount(roomCount);
  if (atmosphere.algorithm === 'cave') {
    return {
      width: Math.min(MAX_BOARD_WIDTH, Math.round((24 + rooms * 2) * CAVE_BOARD_SCALE)),
      height: Math.min(MAX_BOARD_HEIGHT, Math.round((18 + Math.round(rooms * 1.5)) * CAVE_BOARD_SCALE)),
    };
  }
  // A maze fills whatever rock is left, so slack in the board is paid for in corridor. A wide
  // passage eats the board faster, so the board is given the room the passages want.
  const wide = clampCorridorWidth(corridorWidth);
  const spread = 1 + (wide - 1) * 0.5;
  const width = Math.min(MAX_BOARD_WIDTH, Math.round((22 + rooms * 1.8) * spread));
  const height = Math.min(MAX_BOARD_HEIGHT, Math.round((16 + rooms * 1.4) * spread));
  if (atmosphere.rooms?.round) {
    // A round place on a square board, as much floor inside its round as the oblong board would hold,
    // and more for what its rim and the corners of the board leave no room to dig: as long a side as
    // the oblong board's longest, which holds as much inside its round as the largest oblong one.
    const round = Math.sqrt((width * height * 4) / Math.PI) * ROUND_SLACK;
    const side = fitBoardTo(Math.min(MAX_BOARD_WIDTH, Math.round(round)), wide);
    return { width: side, height: side };
  }
  return { width: fitBoardTo(width, wide), height: fitBoardTo(height, wide) };
}

/**
 * Lays out a whole dungeon floor for a request: rooms and mazes or a cave as the atmosphere says, then the
 * tunnel mouth when asked for, the room roles, the doors, the water of a place with water run through it,
 * and the furniture of a furnished place.
 *
 * Everything comes from the request's seed, so the same request gives the same dungeon on every peer.
 * Furniture is put in last, and only where the place is furnished, so that a place with none comes out
 * of its seed exactly as it always has; on hexes no container is stacked. A place with hidden doors has
 * the ways out of its first room dressed as wall. The water is run after the doors are hung, so that no
 * channel comes up against one, and before the furniture, so that nothing stands in it; it takes nothing
 * from the seed's chance, and the ground is dug for it once everything that stands on the ground is placed.
 */
export function generateDungeon(request: DungeonRequest): DungeonLayout {
  const atmosphere = atmosphereById(request.atmosphere);
  const rooms = clampRoomCount(request.roomCount);
  const widths = corridorWidthsFor(atmosphere, request.corridorWidth);
  const asked = boardSizeFor(atmosphere, rooms, widths.most);
  const gridType = request.gridType ?? GridType.SQUARE;
  const roundOnHexes = Math.round(Math.min(asked.width, ROUND_HEX_LONGEST) * ROUND_HEX_FACTOR);
  const { width, height } =
    atmosphere.rooms?.round && isHexGrid(gridType)
      ? { width: roundOnHexes, height: roundOnHexes }
      : boardSizeOn(asked, { type: gridType, sizePx: 1 });
  const rng = seededRandom(request.seed);
  const digging = diggingOf(atmosphere);

  const layout = digging.cave
    ? generateCave(
        {
          width,
          height,
          chamberCount: rooms,
          wallFill: digging.cave.wallFill,
          iterations: digging.cave.iterations,
          birth: digging.cave.birth,
          survive: digging.cave.survive,
          minTunnel: widths.least,
          maxTunnel: widths.most,
          hazardPools: Math.round(digging.cave.hazardPoolsPerRoom * rooms),
          seed: request.seed,
        },
        rng
      )
    : generateRoomsAndMazes(
        {
          width,
          height,
          roomCount: rooms,
          minRoom: digging.rooms.minRoom,
          maxRoom: digging.rooms.maxRoom,
          windingPercent: digging.rooms.windingPercent,
          extraConnectorChance: digging.rooms.extraConnectorChance,
          wallBreakChance: digging.rooms.wallBreakChance,
          shapes: digging.rooms.shapes,
          minCorridor: widths.least,
          maxCorridor: widths.most,
          seed: request.seed,
          ...(digging.rooms.round
            ? {
                round: (x: number, y: number) =>
                  cellCentre({ x, y }, { type: request.gridType ?? GridType.SQUARE, sizePx: 1 }),
              }
            : {}),
        },
        rng
      );

  // Cut before the roles are given out, so depth is counted from the mouth the party walks in by.
  if ((request.entrance ?? atmosphere.entrance) === 'tunnel') openTunnelMouth(layout);
  assignRoomRoles(layout);
  if (atmosphere.roomSets) assignRoomSets(layout, atmosphere.roomSets);
  // Hung last, so that widening an opening cannot leave the room a key opens standing ajar.
  hangDoors(layout, { widths: request.doorWidth, doublePercent: request.doubleDoorPercent }, rng);
  if (atmosphere.hiddenDoors) hideDoorsOf(layout, 0);
  if (atmosphere.waterways) cutWaterways(layout, atmosphere.waterways);
  if (atmosphere.furnishings) {
    const stacksContainers = !isHexGrid(request.gridType ?? GridType.SQUARE);
    layout.furnishings = furnishRooms(layout, atmosphere.furnishings, rng, { stacksContainers });
  }
  // Set last of all, and only where any were asked for, so that a place with none comes out of
  // its seed exactly as it always has - and so that a trap is never set under the furniture.
  const traps = clampTrapCount(request.trapCount);
  if (traps > 0) layout.traps = placeTraps(layout, traps, rng);
  if (atmosphere.waterways) {
    layout.relief = reliefOfWaterways(layout, atmosphere.waterways, request.gridType ?? GridType.SQUARE);
  }
  return layout;
}

export interface DungeonPlan {
  layout: DungeonLayout;
  atmosphere: DungeonAtmosphere;
  blocks: MapBlocks;
}

/** The whole thing worked out but not yet built, which is what the preview and the estimate read. */
export function planDungeon(
  request: DungeonRequest,
  options: DungeonBlockOptions = DEFAULT_BLOCK_OPTIONS
): DungeonPlan {
  const atmosphere = atmosphereById(request.atmosphere);
  const layout = generateDungeon(request);
  const grid: MapGrid = { type: request.gridType ?? GridType.SQUARE, sizePx: 1 };
  const span = mergeSpanFor(grid, MAX_MERGE_SPAN);
  return {
    layout,
    atmosphere,
    blocks: layoutToBlocks(layout, atmosphere, { ...options, mergeSpan: span, gridType: grid.type }),
  };
}
