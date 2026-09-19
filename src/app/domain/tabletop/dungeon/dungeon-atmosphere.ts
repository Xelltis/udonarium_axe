import { DungeonPropId, TextureId, WallTextureId } from '@axe/domain/media/texture-catalog';
import { FurnishingPlan } from '@axe/domain/tabletop/dungeon/room-furnishing';
import { RoomShape } from '@axe/domain/tabletop/dungeon/room-shapes';
import { MapLighting } from '@axe/domain/tabletop/map-blocks';

export const DUNGEON_ATMOSPHERE_IDS = [
  'stoneDungeon',
  'crypt',
  'ruins',
  'cavern',
  'lavaCavern',
  'iceCave',
  'sandTomb',
  'illegalBar',
  'abandonedBuilding',
  'containerWarehouse',
] as const;

export type DungeonAtmosphereId = (typeof DUNGEON_ATMOSPHERE_IDS)[number];

export const DUNGEON_ENTRANCE_STYLES = ['stair', 'tunnel'] as const;

/** A stair suits a floor with more above it; a mouth in the outer wall suits the first one. */
export type DungeonEntranceStyle = (typeof DUNGEON_ENTRANCE_STYLES)[number];

/** How the doors of a place open, which is as much a part of its character as its stone. */
export const DUNGEON_DOOR_STYLES = ['swing', 'slide', 'lift', 'sink'] as const;

export type DungeonDoorStyle = (typeof DUNGEON_DOOR_STYLES)[number];

export interface RoomPlan {
  minRoom: number;
  maxRoom: number;
  /** How much the passages twist. Nothing runs them dead straight, a hundred never does. */
  windingPercent: number;
  /** How often a join the maze no longer needs is opened anyway, which is what makes loops. */
  extraConnectorChance: number;
  wallBreakChance: number;
  shapes: readonly RoomShape[];
  /** How wide a passage is cut when the table has not said, in cells. Left out, one. */
  corridor?: number;
}

export interface CaveShape {
  wallFill: number;
  iterations: number;
  birth: number;
  survive: number;
  tunnelWidth: number;
  hazardFloor?: TextureId;
  hazardPoolsPerRoom: number;
}

export const MIN_WALL_HEIGHT = 0.5;
export const MAX_WALL_HEIGHT = 6;

/** A dungeon wall height rounded to the nearest half and kept within range; not a number gives the lowest. */
export function clampWallHeight(height: number): number {
  if (!Number.isFinite(height)) return MIN_WALL_HEIGHT;
  return Math.min(MAX_WALL_HEIGHT, Math.max(MIN_WALL_HEIGHT, Math.round(height * 2) / 2));
}

/**
 * What the rooms of a place are called, where the names a dungeon gives them would be wrong.
 *
 * Nobody keeps a treasury in a bar. The rooms play the same parts - the one the party walks
 * into, the biggest, the one hardest to get to - but they are a front, a gambling den and the
 * boss's room.
 */
export const DUNGEON_ROLE_NAMINGS = ['illegalBar', 'building', 'warehouse'] as const;

export type DungeonRoleNaming = (typeof DUNGEON_ROLE_NAMINGS)[number];

export interface DungeonAtmosphere {
  id: DungeonAtmosphereId;
  algorithm: 'rooms' | 'cave';
  defaultWall: WallTextureId;
  defaultFloor: TextureId;
  wallHeight: number;
  /** Zero leaves the table lit. Anything else is how deep the dark goes. */
  darkness: number;
  ambientColor: string;
  weatherKind: string;
  weatherDensity: number;
  gridShow: boolean;
  torches: number;
  entrance: DungeonEntranceStyle;
  doorStyle: DungeonDoorStyle;
  rooms?: RoomPlan;
  cave?: CaveShape;
  /** What its doors are made of. Left out, stone in a cave, bars in a crypt and wood anywhere else. */
  door?: DungeonPropId;
  /** What it is lit by. Left out, brackets on the walls and fires where there is room for one. */
  lighting?: MapLighting;
  /** What stands in its rooms. Left out, they are bare. */
  furnishings?: readonly FurnishingPlan[];
  /** What its rooms are called. Left out, they are called what the rooms of a dungeon are. */
  roleNames?: DungeonRoleNaming;
  /**
   * Whether the ways out of the room the party comes into are hidden in its walls.
   *
   * What makes a bar a speakeasy is that the way to it is not a door anybody passing sees.
   */
  hiddenDoors?: boolean;
}

export const DUNGEON_ATMOSPHERES: Record<DungeonAtmosphereId, DungeonAtmosphere> = {
  stoneDungeon: {
    id: 'stoneDungeon',
    algorithm: 'rooms',
    defaultWall: 'wall_ashlar',
    defaultFloor: 'stone_paving_big',
    wallHeight: 2,
    darkness: 0.92,
    ambientColor: '#05060a',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: true,
    torches: 4,
    entrance: 'stair',
    doorStyle: 'swing',
    rooms: {
      minRoom: 5,
      maxRoom: 9,
      windingPercent: 25,
      extraConnectorChance: 0.06,
      wallBreakChance: 0,
      shapes: ['rect', 'overlap'],
    },
  },
  crypt: {
    id: 'crypt',
    algorithm: 'rooms',
    defaultWall: 'wall_bone',
    defaultFloor: 'bone_floor',
    wallHeight: 2,
    darkness: 0.95,
    ambientColor: '#070409',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: true,
    torches: 3,
    entrance: 'stair',
    doorStyle: 'sink',
    rooms: {
      minRoom: 3,
      maxRoom: 5,
      windingPercent: 45,
      extraConnectorChance: 0.12,
      wallBreakChance: 0,
      shapes: ['rect', 'cross'],
    },
  },
  ruins: {
    id: 'ruins',
    algorithm: 'rooms',
    defaultWall: 'wall_mossy_stone',
    defaultFloor: 'moss_stone_floor',
    wallHeight: 1.5,
    darkness: 0,
    ambientColor: '#0b0d0a',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: true,
    torches: 0,
    entrance: 'tunnel',
    doorStyle: 'swing',
    rooms: {
      minRoom: 5,
      maxRoom: 13,
      windingPercent: 15,
      extraConnectorChance: 0.1,
      wallBreakChance: 0.05,
      shapes: ['rect', 'overlap', 'circle'],
    },
  },
  cavern: {
    id: 'cavern',
    algorithm: 'cave',
    defaultWall: 'wall_cave_rock',
    defaultFloor: 'packed_earth',
    wallHeight: 3,
    darkness: 0.9,
    ambientColor: '#06070a',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: false,
    torches: 5,
    entrance: 'tunnel',
    doorStyle: 'lift',
    cave: { wallFill: 0.45, iterations: 4, birth: 5, survive: 4, tunnelWidth: 2, hazardPoolsPerRoom: 0 },
  },
  lavaCavern: {
    id: 'lavaCavern',
    algorithm: 'cave',
    defaultWall: 'wall_obsidian',
    defaultFloor: 'obsidian',
    wallHeight: 3,
    darkness: 0.88,
    ambientColor: '#1a0a04',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: false,
    torches: 2,
    entrance: 'tunnel',
    doorStyle: 'sink',
    cave: {
      wallFill: 0.47,
      iterations: 4,
      birth: 5,
      survive: 4,
      tunnelWidth: 2,
      hazardFloor: 'lava',
      hazardPoolsPerRoom: 0.34,
    },
  },
  iceCave: {
    id: 'iceCave',
    algorithm: 'cave',
    defaultWall: 'wall_ice',
    defaultFloor: 'ice',
    wallHeight: 3,
    darkness: 0.85,
    ambientColor: '#0a1420',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: false,
    torches: 4,
    entrance: 'tunnel',
    doorStyle: 'lift',
    cave: { wallFill: 0.44, iterations: 4, birth: 5, survive: 4, tunnelWidth: 2, hazardPoolsPerRoom: 0 },
  },
  sandTomb: {
    id: 'sandTomb',
    algorithm: 'rooms',
    defaultWall: 'wall_sandstone',
    defaultFloor: 'sandstone_floor',
    wallHeight: 2,
    darkness: 0.92,
    ambientColor: '#0d0904',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: true,
    torches: 4,
    entrance: 'stair',
    doorStyle: 'lift',
    rooms: {
      minRoom: 5,
      maxRoom: 7,
      windingPercent: 10,
      extraConnectorChance: 0.05,
      wallBreakChance: 0,
      shapes: ['rect', 'cross'],
    },
  },
  /**
   * A bar nobody is meant to find, under a shop that is only there to hide it.
   *
   * The party comes down the stair into the front, and the ways on out of it are hidden in its
   * walls. Behind them are the bar with its counter, the back rooms, a gambling den at the end
   * of the longest walk, a store of bootleg liquor, and the boss's room locked at the bottom
   * of it all. It is lit low and red, and the doors run aside by themselves.
   */
  illegalBar: {
    id: 'illegalBar',
    algorithm: 'rooms',
    defaultWall: 'wall_neon',
    defaultFloor: 'neon_floor',
    wallHeight: 2,
    darkness: 0.85,
    ambientColor: '#16040c',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: true,
    torches: 5,
    entrance: 'stair',
    doorStyle: 'slide',
    door: 'door_steel',
    lighting: { wall: ['neon'], open: [], colors: ['#ff3b5c', '#ff2bd6', '#b44dff'] },
    roleNames: 'illegalBar',
    hiddenDoors: true,
    rooms: {
      minRoom: 5,
      maxRoom: 9,
      windingPercent: 5,
      extraConnectorChance: 0.08,
      wallBreakChance: 0,
      shapes: ['rect'],
    },
    furnishings: [
      { piece: 'shopCounter', arrangement: 'counter', roles: ['entrance'], every: 0 },
      { piece: 'counter', arrangement: 'counter', roles: ['hall'], every: 0, seat: 'stool' },
      { piece: 'gamingTable', arrangement: 'scatter', roles: ['treasure'], every: 6 },
      { piece: 'table', arrangement: 'scatter', roles: ['hall', 'chamber', 'boss'], every: 9 },
      { piece: 'crate', arrangement: 'scatter', roles: ['entrance', 'deadEnd'], every: 5 },
    ],
  },
  /**
   * A floor of an office block left to rot.
   *
   * Straight corridors between square rooms, the columns still holding the ceiling up in the
   * big ones, steel desks shoved about, and walls fallen through where nobody mended them.
   * Whoever lives here now burns what they find in drums.
   */
  abandonedBuilding: {
    id: 'abandonedBuilding',
    algorithm: 'rooms',
    defaultWall: 'wall_concrete',
    defaultFloor: 'concrete_floor',
    wallHeight: 2.5,
    darkness: 0.75,
    ambientColor: '#0a0c0f',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: true,
    torches: 3,
    entrance: 'stair',
    doorStyle: 'swing',
    door: 'door_steel',
    lighting: { wall: ['lantern'], open: ['brazier'] },
    roleNames: 'building',
    rooms: {
      minRoom: 5,
      maxRoom: 11,
      windingPercent: 5,
      extraConnectorChance: 0.15,
      wallBreakChance: 0.1,
      shapes: ['rect', 'overlap'],
    },
    furnishings: [
      { piece: 'pillar', arrangement: 'grid', roles: ['entrance', 'hall', 'boss'], every: 4 },
      { piece: 'desk', arrangement: 'scatter', roles: ['chamber', 'treasure', 'boss'], every: 9 },
      { piece: 'crate', arrangement: 'scatter', roles: ['deadEnd'], every: 6 },
      {
        piece: 'rubble',
        arrangement: 'scatter',
        roles: ['entrance', 'hall', 'treasure', 'boss', 'deadEnd', 'chamber'],
        every: 14,
      },
    ],
  },
  /**
   * A dockside warehouse stacked with shipping containers.
   *
   * The party comes in through the loading bay. The big holds are aisles between rows of
   * containers two high, the side rooms are the site office and the supply room, and the
   * passages between them are wide enough for a forklift. Fluorescent tubes buzz on the walls,
   * and the doors are shutters that roll up.
   */
  containerWarehouse: {
    id: 'containerWarehouse',
    algorithm: 'rooms',
    defaultWall: 'wall_warehouse',
    defaultFloor: 'warehouse_floor',
    wallHeight: 4,
    darkness: 0.7,
    ambientColor: '#0a0c10',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: true,
    torches: 6,
    entrance: 'tunnel',
    doorStyle: 'lift',
    door: 'door_shutter',
    lighting: { wall: ['fluorescent'], open: [], colors: ['#e6f0ff'] },
    roleNames: 'warehouse',
    rooms: {
      minRoom: 7,
      maxRoom: 13,
      windingPercent: 0,
      extraConnectorChance: 0.15,
      wallBreakChance: 0,
      shapes: ['rect'],
      corridor: 2,
    },
    furnishings: [
      {
        piece: 'containerRed',
        arrangement: 'stacks',
        roles: ['hall', 'chamber', 'treasure', 'boss'],
        every: 2,
        pieces: ['containerRed', 'containerBlue', 'containerGreen'],
      },
      { piece: 'desk', arrangement: 'scatter', roles: ['deadEnd'], every: 7 },
      { piece: 'crate', arrangement: 'scatter', roles: ['entrance', 'deadEnd'], every: 12 },
    ],
  },
};

/** The dungeon atmosphere preset with this id, falling back to the stone dungeon for an unknown id. */
export function atmosphereById(id: string): DungeonAtmosphere {
  return DUNGEON_ATMOSPHERES[id as DungeonAtmosphereId] ?? DUNGEON_ATMOSPHERES.stoneDungeon;
}
