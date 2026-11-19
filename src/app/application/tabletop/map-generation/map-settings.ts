import type { DungeonMaterial } from '@axe/application/tabletop/dungeon-build.service';
import { withFieldMaterials } from '@axe/application/tabletop/map-generation/field-materials';
import { clampDoubleDoorPercent, type DoorWidths, doorWidthsFor } from '@axe/domain/tabletop/dungeon/door-hanging';
import {
  atmosphereById,
  clampWallHeight,
  type DungeonAtmosphereId,
  type DungeonEntranceStyle,
} from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import { type CorridorWidths, corridorWidthsFor, planDungeon } from '@axe/domain/tabletop/dungeon/dungeon-generator';
import type { DoorKind } from '@axe/domain/tabletop/dungeon/furnishing-models';
import {
  DEFAULT_FIELD_RELIEF,
  fieldAtmosphereById,
  type FieldAtmosphereId,
} from '@axe/domain/tabletop/field/field-atmosphere';
import { type FieldPlan, planField } from '@axe/domain/tabletop/field/field-generator';
import type { FieldSeason } from '@axe/domain/tabletop/field/field-models';
import { GridType } from '@axe/domain/tabletop/game-table';

/** Whether a map is a dungeon of rooms and passages, or open country. */
export type MapKind = 'dungeon' | 'field';

export const MAP_KINDS: readonly MapKind[] = ['dungeon', 'field'];

/** A dungeon's plan, as `planDungeon` lays it out. */
export type DungeonPlan = ReturnType<typeof planDungeon>;

/**
 * Everything a map is made from, as the generator panel sets it and an AI asks for it: the kind, the
 * atmosphere, the size, the seed and the shape of the cells, and each material and measure left to
 * the atmosphere where it is null. The same settings make the same map, whoever makes it.
 */
export interface MapSettings {
  readonly kind: MapKind;
  readonly atmosphere: DungeonAtmosphereId;
  readonly fieldAtmosphere: FieldAtmosphereId;
  readonly fieldSize: number;
  readonly fieldDensity: number;
  readonly fieldRelief: number;
  readonly fieldSeason: FieldSeason;
  /** Whether trees, rocks and furniture are stood as the bundled 3D models rather than built of blocks. */
  readonly models: boolean;
  readonly roomCount: number;
  readonly trapCount: number;
  readonly seed: number;
  readonly gridType: GridType;
  readonly placeDoors: boolean;
  readonly placeStairs: boolean;
  readonly sheerWalls: boolean;
  /** The kind of door hung in every doorway, or null for the one the place hangs. */
  readonly doorKind: DoorKind | null;
  readonly wall: DungeonMaterial | null;
  readonly floor: DungeonMaterial | null;
  readonly wallHeight: number | null;
  readonly entrance: DungeonEntranceStyle | null;
  readonly corridor: CorridorWidths | null;
  readonly door: DoorWidths | null;
  readonly doubleDoors: number | null;
}

/** The settings the generator starts on, but for its seed, which each map rolls afresh. */
export const DEFAULT_MAP_SETTINGS: Omit<MapSettings, 'seed'> = {
  kind: 'dungeon',
  atmosphere: 'stoneDungeon',
  fieldAtmosphere: 'woodland',
  fieldSize: 40,
  fieldDensity: 50,
  fieldRelief: DEFAULT_FIELD_RELIEF,
  fieldSeason: '',
  models: true,
  roomCount: 8,
  trapCount: 0,
  gridType: GridType.SQUARE,
  placeDoors: true,
  placeStairs: true,
  sheerWalls: false,
  doorKind: null,
  wall: null,
  floor: null,
  wallHeight: null,
  entrance: null,
  corridor: null,
  door: null,
  doubleDoors: null,
};

/** The most a seed rolled afresh may be. */
export const MAP_SEED_LIMIT = 2 ** 31;

/** The material the walls are made of, or of a field the obstacles: the one chosen, else the atmosphere's own. */
export function mapWallOf(
  settings: Pick<MapSettings, 'kind' | 'atmosphere' | 'fieldAtmosphere' | 'wall'>
): DungeonMaterial {
  if (settings.wall) return settings.wall;
  const id =
    settings.kind === 'field'
      ? fieldAtmosphereById(settings.fieldAtmosphere).defaultProp
      : atmosphereById(settings.atmosphere).defaultWall;
  return { kind: 'texture', id };
}

/** The material the floor is painted with: the one chosen, else the atmosphere's own. */
export function mapFloorOf(
  settings: Pick<MapSettings, 'kind' | 'atmosphere' | 'fieldAtmosphere' | 'floor'>
): DungeonMaterial {
  if (settings.floor) return settings.floor;
  const id =
    settings.kind === 'field'
      ? fieldAtmosphereById(settings.fieldAtmosphere).defaultGround
      : atmosphereById(settings.atmosphere).defaultFloor;
  return { kind: 'texture', id };
}

/** How tall the walls stand, in cells: the height chosen, else the atmosphere's, held to the bounds. */
export function mapWallHeightOf(settings: Pick<MapSettings, 'atmosphere' | 'wallHeight'>): number {
  return clampWallHeight(settings.wallHeight ?? atmosphereById(settings.atmosphere).wallHeight);
}

/** How the way in is made: the style chosen, else the atmosphere's. */
export function mapEntranceOf(settings: Pick<MapSettings, 'atmosphere' | 'entrance'>): DungeonEntranceStyle {
  return settings.entrance ?? atmosphereById(settings.atmosphere).entrance;
}

/** How wide the passages are cut, which each atmosphere has its own idea of. */
export function mapCorridorWidthOf(settings: Pick<MapSettings, 'atmosphere' | 'corridor'>): CorridorWidths {
  return corridorWidthsFor(atmosphereById(settings.atmosphere), settings.corridor ?? undefined);
}

/** How wide the doors are hung. */
export function mapDoorWidthOf(settings: Pick<MapSettings, 'door'>): DoorWidths {
  return doorWidthsFor(settings.door ?? undefined);
}

/** How many of the doors in a hundred part in the middle rather than swing whole. */
export function mapDoubleDoorsOf(settings: Pick<MapSettings, 'doubleDoors'>): number {
  return clampDoubleDoorPercent(settings.doubleDoors ?? undefined);
}

/** The settings that shape a dungeon; its materials do not, so a new swatch does not roll it again. */
export type DungeonShapeSettings = Pick<
  MapSettings,
  | 'atmosphere'
  | 'roomCount'
  | 'seed'
  | 'entrance'
  | 'corridor'
  | 'door'
  | 'doubleDoors'
  | 'trapCount'
  | 'gridType'
  | 'placeDoors'
  | 'placeStairs'
  | 'sheerWalls'
  | 'models'
  | 'doorKind'
>;

/** A dungeon laid out from its settings. */
export function dungeonPlanOf(settings: DungeonShapeSettings): DungeonPlan {
  return planDungeon(
    {
      atmosphere: settings.atmosphere,
      roomCount: settings.roomCount,
      seed: settings.seed,
      entrance: mapEntranceOf(settings),
      corridorWidth: mapCorridorWidthOf(settings),
      doorWidth: mapDoorWidthOf(settings),
      doubleDoorPercent: mapDoubleDoorsOf(settings),
      trapCount: settings.trapCount,
      gridType: settings.gridType,
    },
    {
      placeDoors: settings.placeDoors,
      placeStairs: settings.placeStairs,
      sheerWalls: settings.sheerWalls,
      models: settings.models,
      ...(settings.doorKind ? { door: settings.doorKind } : {}),
    }
  );
}

/** The settings that shape open country; its materials do not, so a new swatch does not roll it again either. */
export type FieldShapeSettings = Pick<
  MapSettings,
  'fieldAtmosphere' | 'fieldSize' | 'fieldDensity' | 'seed' | 'gridType' | 'fieldRelief' | 'models' | 'fieldSeason'
>;

/** Open country laid out from its settings, before its materials are chosen. */
export function fieldShapeOf(settings: FieldShapeSettings): FieldPlan {
  return planField({
    atmosphere: settings.fieldAtmosphere,
    size: settings.fieldSize,
    density: settings.fieldDensity,
    seed: settings.seed,
    gridType: settings.gridType,
    relief: settings.fieldRelief,
    models: settings.models,
    season: settings.fieldSeason,
  });
}

/** Open country as laid out, wearing the floor chosen and the obstacles' material where one was. */
export function fieldPlanOf(
  shape: FieldPlan,
  settings: Pick<MapSettings, 'kind' | 'atmosphere' | 'fieldAtmosphere' | 'floor' | 'wall'>
): FieldPlan {
  return { ...shape, blocks: withFieldMaterials(shape.blocks, shape.atmosphere, mapFloorOf(settings), settings.wall) };
}

/** The map its settings make, a dungeon or open country. */
export function mapPlanOf(settings: MapSettings): DungeonPlan | FieldPlan {
  return settings.kind === 'field' ? fieldPlanOf(fieldShapeOf(settings), settings) : dungeonPlanOf(settings);
}
