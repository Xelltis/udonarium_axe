import { clamp } from '@axe/core/util/clamp';
import { DungeonPropId, TextureId, WallTextureId } from '@axe/domain/media/texture-catalog';
import type { DungeonRoomRoleValue, FurnishingId } from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { FurnishingPlan } from '@axe/domain/tabletop/dungeon/room-furnishing';
import { RoomShape } from '@axe/domain/tabletop/dungeon/room-shapes';
import { HazardKind } from '@axe/domain/tabletop/hazard-presets';
import { MapLighting } from '@axe/domain/tabletop/map-blocks';
import type { TriggerMoment } from '@axe/domain/tabletop/trigger-event';

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
  'sewer',
  'wizardTower',
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
  /** Whether the place is round, as a floor of a tower is, on a square board. Left out, it fills the board. */
  round?: boolean;
}

export interface CaveShape {
  wallFill: number;
  iterations: number;
  birth: number;
  survive: number;
  tunnelWidth: number;
  hazardFloor?: TextureId;
  /** What those pools are, where they are dangerous ground and not only a picture of it. */
  hazardKind?: HazardKind;
  hazardPoolsPerRoom: number;
}

export const MIN_WALL_HEIGHT = 0.5;
export const MAX_WALL_HEIGHT = 6;

/** A dungeon wall height rounded to the nearest half and kept within range; not a number gives the lowest. */
export function clampWallHeight(height: number): number {
  if (!Number.isFinite(height)) return MIN_WALL_HEIGHT;
  return clamp(Math.round(height * 2) / 2, MIN_WALL_HEIGHT, MAX_WALL_HEIGHT);
}

/**
 * What the rooms of a place are called, where the names a dungeon gives them would be wrong.
 *
 * Nobody keeps a treasury in a bar. The rooms play the same parts - the one the party walks
 * into, the biggest, the one hardest to get to - but they are a front, a gambling den and the
 * boss's room.
 */
export const DUNGEON_ROLE_NAMINGS = ['illegalBar', 'building', 'warehouse', 'sewer', 'wizardTower'] as const;

export type DungeonRoleNaming = (typeof DUNGEON_ROLE_NAMINGS)[number];

/** How deep one kind of water lies: its bed and its surface, both over the board, in cells. */
export interface WaterLevel {
  bed: number;
  surface: number;
}

/**
 * Water run through a place: down the middle of each passage wide enough to keep a walkway either
 * side of it, and into a basin in some of its rooms, with a ledge of floor left round the basin.
 *
 * The floor is raised to the walkway so that the water can be dug down into it, since water stands
 * on the board and no lower.
 */
export interface WaterwayPlan {
  /** The rooms that hold a basin, by the part they play. */
  basinRoles: readonly DungeonRoomRoleValue[];
  /** How high the floor stands over the board, in cells: the walkways and the ledges. */
  walkway: number;
  channel: WaterLevel;
  basin: WaterLevel;
  /**
   * How many cells of each channel, counted back from where it drains, are cut as deep as a basin, so
   * that the channel falls into them over a weir. A channel no longer than that is left as it is.
   */
  outfallCells: number;
  /** How fast a channel runs, from 0 to 1. A basin lies still. */
  flowSpeed: number;
  /** What the water looks like, as the settings of water name it. */
  look: { color: string; turbidity: number; dirt: number };
  /**
   * What wading it costs over plain footing, what it does to whoever is caught in it, and what that is
   * called on the table, as one of the pieces the generator names.
   */
  wading: { extraCost: number; amount: string; ailment: string; moment: TriggerMoment; color: string; thing: string };
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
  /** What its doors are made of. Left out, stone in a cave, bars in a crypt and wood anywhere else. */
  door?: DungeonPropId;
  /** What the ways up and down are drawn as. Left out, a stair each. */
  stairs?: { up: DungeonPropId; down: DungeonPropId };
  /** The water run through it. Left out, it is dry. */
  waterways?: WaterwayPlan;
  /** What it is lit by. Left out, brackets on the walls and fires where there is room for one. */
  lighting?: MapLighting;
  /** What stands in its rooms. Left out, they are bare. */
  furnishings?: readonly FurnishingPlan[];
  /** What its rooms are called. Left out, they are called what the rooms of a dungeon are. */
  roleNames?: DungeonRoleNaming;
  /**
   * The kinds of room it keeps for the rooms playing a part, given to them in turn, each furnished as
   * the plans for that kind say and called by its name: a tower's small rooms are a library, a workshop, an
   * observatory and a bedroom. Left out, every room playing a part is the same kind.
   */
  roomSets?: Readonly<Partial<Record<DungeonRoomRoleValue, readonly string[]>>>;
  /**
   * Whether the ways out of the room the party comes into are hidden in its walls.
   *
   * What makes a bar a speakeasy is that the way to it is not a door anybody passing sees.
   */
  hiddenDoors?: boolean;
}

/** The neon signs a bar hangs over its booths, its jukebox and its machines, a different one to each run. */
const NEON_SIGNS: readonly FurnishingId[] = ['neonCocktail', 'neonDice', 'neonHeart'];

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
      hazardKind: 'lava',
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
   * A bar nobody is meant to find, under a shop that is only there to hide it, in a city of neon
   * and rain.
   *
   * The party comes down the stair into the front, a corner shop with its shelves and vending
   * machines, and the ways on out of it are hidden in its walls. Behind them are the bar with its
   * counter and its shelves of bottles, booths along the walls under the neon, a jukebox; a gambling
   * den of slot machines and a roulette wheel at the end of the longest walk; a store of bootleg
   * liquor and the still it comes out of; back rooms kept as lounges or as rooms of arcade games;
   * and the boss's office locked at the bottom of it all, a big desk, a fish tank and a safe. It is
   * lit low and red, the signs glow, and the doors run aside by themselves.
   */
  illegalBar: {
    id: 'illegalBar',
    algorithm: 'rooms',
    defaultWall: 'wall_bar_brick',
    defaultFloor: 'bar_terrazzo',
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
    roomSets: { chamber: ['lounge', 'arcade'] },
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
      { piece: 'barCounter', arrangement: 'counter', roles: ['hall'], every: 0, seat: 'stool', back: 'backBar' },
      { piece: 'rouletteTable', arrangement: 'centre', roles: ['treasure'], every: 0 },
      { piece: 'executiveDesk', arrangement: 'centre', roles: ['boss'], every: 0 },
      { piece: 'goodsShelf', arrangement: 'wall', roles: ['entrance'], every: 5, most: 3 },
      { piece: 'vendingMachine', arrangement: 'wall', roles: ['entrance'], every: 14, most: 2 },
      { piece: 'boothSofa', arrangement: 'wall', roles: ['hall'], every: 5, most: 3, above: NEON_SIGNS },
      { piece: 'jukebox', arrangement: 'wall', roles: ['hall'], every: 40, most: 1, above: NEON_SIGNS },
      { piece: 'speaker', arrangement: 'wall', roles: ['hall'], every: 40, most: 1 },
      { piece: 'slotMachine', arrangement: 'wall', roles: ['treasure'], every: 4, most: 4, above: NEON_SIGNS },
      { piece: 'boothSofa', arrangement: 'wall', roles: ['boss'], every: 12, most: 2 },
      { piece: 'aquarium', arrangement: 'wall', roles: ['boss'], every: 40, most: 1 },
      {
        piece: 'boothSofa',
        arrangement: 'wall',
        roles: ['chamber'],
        every: 5,
        most: 3,
        above: NEON_SIGNS,
        set: 'lounge',
      },
      {
        piece: 'arcadeCabinet',
        arrangement: 'wall',
        roles: ['chamber'],
        every: 4,
        most: 4,
        above: NEON_SIGNS,
        set: 'arcade',
      },
      { piece: 'speaker', arrangement: 'wall', roles: ['chamber'], every: 40, most: 1, set: 'arcade' },
      { piece: 'table', arrangement: 'scatter', roles: ['hall'], every: 9 },
      { piece: 'gamingTable', arrangement: 'scatter', roles: ['treasure'], every: 9 },
      { piece: 'lowTable', arrangement: 'scatter', roles: ['chamber'], every: 9, set: 'lounge' },
      { piece: 'lowTable', arrangement: 'scatter', roles: ['boss'], every: 20 },
      { piece: 'still', arrangement: 'scatter', roles: ['deadEnd'], every: 14 },
      { piece: 'crate', arrangement: 'corners', roles: ['entrance'], every: 8 },
      { piece: 'barrel', arrangement: 'corners', roles: ['deadEnd'], every: 3, pieces: ['barrel', 'barrel', 'crate'] },
      { piece: 'safe', arrangement: 'corners', roles: ['boss'], every: 40 },
      { piece: 'plant', arrangement: 'corners', roles: ['hall', 'boss', 'chamber'], every: 40 },
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
  /**
   * A city's sewers.
   *
   * The party climbs down through a maintenance hatch. Every passage is wide enough for a channel of
   * foul water down its middle with a walkway either side, and the channels run on into the cisterns
   * and settling tanks, basins sunk in the floor of the biggest rooms and of those at the ends of
   * things. Smugglers keep their goods heaped in the corners back here, and the pumps are at the bottom
   * of it all, a pipe run round its walls with a valve every few lengths. Lanterns
   * hang on the walls and the gates are iron grates that lift.
   */
  sewer: {
    id: 'sewer',
    algorithm: 'rooms',
    defaultWall: 'wall_sewer_brick',
    defaultFloor: 'stone_paving_wet',
    wallHeight: 2.5,
    darkness: 0.92,
    ambientColor: '#04080a',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: true,
    torches: 5,
    entrance: 'stair',
    doorStyle: 'lift',
    door: 'door_iron_grate',
    stairs: { up: 'ladder_up', down: 'stair_down' },
    lighting: { wall: ['lantern'], open: [] },
    roleNames: 'sewer',
    rooms: {
      minRoom: 5,
      maxRoom: 11,
      windingPercent: 15,
      extraConnectorChance: 0.08,
      wallBreakChance: 0,
      shapes: ['rect'],
      corridor: 3,
    },
    waterways: {
      basinRoles: ['hall', 'deadEnd'],
      walkway: 1,
      channel: { bed: 0.4, surface: 0.75 },
      basin: { bed: 0, surface: 0.3 },
      outfallCells: 3,
      flowSpeed: 0.55,
      look: { color: '#46584a', turbidity: 0.65, dirt: 0.3 },
      wading: { extraCost: 1, amount: '1d6', ailment: '毒', moment: 'turnStart', color: '#39452a', thing: 'sewage' },
    },
    furnishings: [
      { piece: 'pipe', arrangement: 'pipeRun', roles: ['boss'], every: 3 },
      { piece: 'crate', arrangement: 'corners', roles: ['treasure'], every: 7, pieces: ['crate', 'crate', 'barrel'] },
      { piece: 'barrel', arrangement: 'corners', roles: ['entrance', 'chamber'], every: 14 },
      { piece: 'pipe', arrangement: 'pipeRun', roles: ['chamber'], every: 2, most: 6 },
    ],
  },
  /**
   * A floor of a wizard's tower: round, walled in stone, its rooms opening off passages that wind
   * between them, a spiral stair the way up and down.
   *
   * The stair comes up in a room lit by candles, watched over by a gargoyle. The biggest room is the
   * summoning chamber, a circle of runes glowing on its floor; the hardest to reach keeps the
   * wizard's treasures round a crystal floating over its pedestal; and the deepest is the wizard's
   * own study, its desk among bookshelves. The dead ends are stores of jars and ingredients, and the
   * small rooms are kept in turn as a library, a workshop round a cauldron, an observatory with its
   * orrery and telescopes, and a bedroom. It is dark but for the candles and what glows.
   */
  wizardTower: {
    id: 'wizardTower',
    algorithm: 'rooms',
    defaultWall: 'wall_ashlar',
    defaultFloor: 'wood_plank',
    wallHeight: 2,
    darkness: 0.85,
    ambientColor: '#0d0a1c',
    weatherKind: '',
    weatherDensity: 0,
    gridShow: true,
    torches: 6,
    entrance: 'stair',
    doorStyle: 'swing',
    door: 'door_wood',
    stairs: { up: 'stair_spiral', down: 'stair_spiral' },
    lighting: { wall: ['sconce'], open: ['stand'], colors: ['#b48cff', '#7fd6ff', '#ffcf7a'] },
    roleNames: 'wizardTower',
    roomSets: { chamber: ['library', 'workshop', 'observatory', 'bedroom'] },
    rooms: {
      minRoom: 5,
      maxRoom: 7,
      windingPercent: 30,
      extraConnectorChance: 0.1,
      wallBreakChance: 0,
      shapes: ['rect', 'circle'],
      round: true,
    },
    furnishings: [
      { piece: 'magicCircle', arrangement: 'centre', roles: ['hall'], every: 0 },
      { piece: 'crystalPedestal', arrangement: 'centre', roles: ['treasure'], every: 0 },
      { piece: 'cauldron', arrangement: 'centre', roles: ['chamber'], every: 0, set: 'workshop' },
      { piece: 'orrery', arrangement: 'centre', roles: ['chamber'], every: 0, set: 'observatory' },
      { piece: 'writingDesk', arrangement: 'wall', roles: ['boss'], every: 40, most: 1 },
      { piece: 'bookshelf', arrangement: 'wall', roles: ['boss'], every: 5, most: 3 },
      { piece: 'bookshelf', arrangement: 'wall', roles: ['chamber'], every: 3, most: 4, set: 'library' },
      { piece: 'potionShelf', arrangement: 'wall', roles: ['deadEnd'], every: 6, most: 2 },
      { piece: 'alchemyTable', arrangement: 'wall', roles: ['chamber'], every: 6, most: 2, set: 'workshop' },
      { piece: 'potionShelf', arrangement: 'wall', roles: ['chamber'], every: 8, most: 2, set: 'workshop' },
      { piece: 'bookshelf', arrangement: 'wall', roles: ['chamber'], every: 10, most: 2, set: 'observatory' },
      { piece: 'canopyBed', arrangement: 'wall', roles: ['chamber'], every: 40, most: 1, set: 'bedroom' },
      { piece: 'wardrobe', arrangement: 'wall', roles: ['chamber'], every: 40, most: 1, set: 'bedroom' },
      { piece: 'lectern', arrangement: 'scatter', roles: ['chamber'], every: 12, set: 'library' },
      { piece: 'lectern', arrangement: 'scatter', roles: ['boss'], every: 20 },
      { piece: 'telescope', arrangement: 'scatter', roles: ['chamber'], every: 14, set: 'observatory' },
      { piece: 'treasureChest', arrangement: 'corners', roles: ['treasure'], every: 5 },
      { piece: 'bookPile', arrangement: 'corners', roles: ['boss', 'chamber'], every: 18 },
      { piece: 'candelabra', arrangement: 'corners', roles: ['entrance', 'hall', 'boss', 'chamber'], every: 14 },
      { piece: 'gargoyle', arrangement: 'corners', roles: ['entrance', 'hall', 'treasure'], every: 30 },
      {
        piece: 'storageJars',
        arrangement: 'corners',
        roles: ['deadEnd'],
        every: 3,
        pieces: ['storageJars', 'storageJars', 'crate', 'barrel'],
      },
    ],
  },
};

/** The dungeon atmosphere preset with this id, falling back to the stone dungeon for an unknown id. */
export function atmosphereById(id: string): DungeonAtmosphere {
  return DUNGEON_ATMOSPHERES[id as DungeonAtmosphereId] ?? DUNGEON_ATMOSPHERES.stoneDungeon;
}
