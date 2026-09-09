import { seededRandom } from '@axe/core/util/seeded-random';
import { generateCave } from '@axe/domain/tabletop/dungeon/cave-automata';
import { DoorWidths, hangDoors } from '@axe/domain/tabletop/dungeon/door-hanging';
import {
  atmosphereById,
  DungeonAtmosphere,
  DungeonAtmosphereId,
  DungeonEntranceStyle,
} from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import {
  DEFAULT_BLOCK_OPTIONS,
  DungeonBlockOptions,
  layoutToBlocks,
  MAX_MERGE_SPAN,
} from '@axe/domain/tabletop/dungeon/dungeon-blocks';
import { clampCorridorWidth, DungeonLayout } from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { assignRoomRoles } from '@axe/domain/tabletop/dungeon/room-roles';
import { fitBoardTo, generateRoomsAndMazes } from '@axe/domain/tabletop/dungeon/rooms-and-mazes';
import { openTunnelMouth } from '@axe/domain/tabletop/dungeon/tunnel-mouth';
import { GridType } from '@axe/domain/tabletop/game-table';
import { MapBlocks } from '@axe/domain/tabletop/map-blocks';
import { boardSizeOn, MapGrid, mergeSpanFor } from '@axe/domain/tabletop/map-grid';

export const MIN_ROOM_COUNT = 3;
export const MAX_ROOM_COUNT = 20;
/** One scratch mask covers at most fifty cells a side, and the whole board wants covering. */
export const MAX_BOARD_WIDTH = 50;
export const MAX_BOARD_HEIGHT = 38;
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

export function clampRoomCount(roomCount: number): number {
  if (!Number.isFinite(roomCount)) return MIN_ROOM_COUNT;
  return Math.min(MAX_ROOM_COUNT, Math.max(MIN_ROOM_COUNT, Math.round(roomCount)));
}

/** How wide a passage this atmosphere cuts when the room has not said otherwise. */
export function defaultCorridorWidth(atmosphere: DungeonAtmosphere): number {
  return clampCorridorWidth(atmosphere.algorithm === 'cave' ? atmosphere.cave!.tunnelWidth : 1);
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
  return {
    width: fitBoardTo(Math.min(MAX_BOARD_WIDTH, Math.round((22 + rooms * 1.8) * spread)), wide),
    height: fitBoardTo(Math.min(MAX_BOARD_HEIGHT, Math.round((16 + rooms * 1.4) * spread)), wide),
  };
}

export function generateDungeon(request: DungeonRequest): DungeonLayout {
  const atmosphere = atmosphereById(request.atmosphere);
  const rooms = clampRoomCount(request.roomCount);
  const widths = corridorWidthsFor(atmosphere, request.corridorWidth);
  const { width, height } = boardSizeOn(boardSizeFor(atmosphere, rooms, widths.most), {
    type: request.gridType ?? GridType.SQUARE,
    sizePx: 1,
  });
  const rng = seededRandom(request.seed);

  const layout =
    atmosphere.algorithm === 'cave'
      ? generateCave(
          {
            width,
            height,
            chamberCount: rooms,
            wallFill: atmosphere.cave!.wallFill,
            iterations: atmosphere.cave!.iterations,
            birth: atmosphere.cave!.birth,
            survive: atmosphere.cave!.survive,
            minTunnel: widths.least,
            maxTunnel: widths.most,
            hazardPools: Math.round(atmosphere.cave!.hazardPoolsPerRoom * rooms),
            seed: request.seed,
          },
          rng
        )
      : generateRoomsAndMazes(
          {
            width,
            height,
            roomCount: rooms,
            minRoom: atmosphere.rooms!.minRoom,
            maxRoom: atmosphere.rooms!.maxRoom,
            windingPercent: atmosphere.rooms!.windingPercent,
            extraConnectorChance: atmosphere.rooms!.extraConnectorChance,
            wallBreakChance: atmosphere.rooms!.wallBreakChance,
            shapes: atmosphere.rooms!.shapes,
            minCorridor: widths.least,
            maxCorridor: widths.most,
            seed: request.seed,
          },
          rng
        );

  // Cut before the roles are given out, so depth is counted from the mouth the party walks in by.
  if ((request.entrance ?? atmosphere.entrance) === 'tunnel') openTunnelMouth(layout);
  assignRoomRoles(layout);
  // Hung last, so that widening an opening cannot leave the room a key opens standing ajar.
  hangDoors(layout, { widths: request.doorWidth, doublePercent: request.doubleDoorPercent }, rng);
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
  return { layout, atmosphere, blocks: layoutToBlocks(layout, atmosphere, { ...options, mergeSpan: span }) };
}
