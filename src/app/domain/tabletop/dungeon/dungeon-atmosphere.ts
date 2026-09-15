import { TextureId, WallTextureId } from '@axe/domain/media/texture-catalog';
import { RoomShape } from '@axe/domain/tabletop/dungeon/room-shapes';

export const DUNGEON_ATMOSPHERE_IDS = [
  'stoneDungeon',
  'crypt',
  'ruins',
  'cavern',
  'lavaCavern',
  'iceCave',
  'sandTomb',
] as const;

export type DungeonAtmosphereId = (typeof DUNGEON_ATMOSPHERE_IDS)[number];

export const DUNGEON_ENTRANCE_STYLES = ['stair', 'tunnel'] as const;

/** A stair suits a floor with more above it; a mouth in the outer wall suits the first one. */
export type DungeonEntranceStyle = (typeof DUNGEON_ENTRANCE_STYLES)[number];

/** How the doors of a place open, which is as much a part of its character as its stone. */
export const DUNGEON_DOOR_STYLES = ['swing', 'lift', 'sink'] as const;

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
};

/** The dungeon atmosphere preset with this id, falling back to the stone dungeon for an unknown id. */
export function atmosphereById(id: string): DungeonAtmosphere {
  return DUNGEON_ATMOSPHERES[id as DungeonAtmosphereId] ?? DUNGEON_ATMOSPHERES.stoneDungeon;
}
