import type { DungeonPropId } from '@axe/domain/media/texture-catalog';
import type { DungeonDoorStyle } from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import type { FurnishingId } from '@axe/domain/tabletop/dungeon/dungeon-layout';

/** The 3D models bundled with the app that the furniture and the doors of a dungeon can be stood as. */
export const FURNISHING_MODEL_IDS = [
  'prop_crate',
  'prop_stool',
  'prop_desk',
  'prop_gamingTable',
  'prop_rubble',
  'prop_containerRed',
  'prop_containerBlue',
  'prop_containerGreen',
  'prop_counter',
  'prop_shopCounter',
  'prop_barTable',
  'door_wood',
  'door_steel',
  'door_iron_grate',
  'door_stone',
  'door_shutter',
  'door_saloon',
] as const;

export type FurnishingModelId = (typeof FURNISHING_MODEL_IDS)[number];

/** Whether a bundled model's name is one of the furniture's. */
export function isFurnishingModel(id: string): id is FurnishingModelId {
  return (FURNISHING_MODEL_IDS as readonly string[]).includes(id);
}

/** Where a bundled piece of furniture's bytes are served from, beside the page. */
export function furnishingModelUrl(id: FurnishingModelId): string {
  return `assets/models/props/${id}.glb`;
}

/**
 * The model each piece of furniture is stood as. A pillar has none: it is of the walls' own stone and
 * as tall as they are, both of which the generator lets be chosen, so it is built of its blocks as ever.
 */
export const FURNISHING_MODELS: Readonly<Partial<Record<FurnishingId, FurnishingModelId>>> = {
  counter: 'prop_counter',
  shopCounter: 'prop_shopCounter',
  table: 'prop_barTable',
  crate: 'prop_crate',
  stool: 'prop_stool',
  desk: 'prop_desk',
  gamingTable: 'prop_gamingTable',
  rubble: 'prop_rubble',
  containerRed: 'prop_containerRed',
  containerBlue: 'prop_containerBlue',
  containerGreen: 'prop_containerGreen',
};

/** The pieces whose model is one cell of a run: a counter of any length is a row of them, ends meeting. */
export const FURNISHING_SEGMENT_MODELS: readonly FurnishingId[] = ['counter', 'shopCounter'];

/**
 * The model each kind of door is stood as: a leaf one wide, two tall and a quarter deep, hinged at
 * its west end, which the table stretches to the door's own size and swings, slides or lifts with it.
 */
export const DOOR_MODELS: Readonly<Partial<Record<DungeonPropId, FurnishingModelId>>> = {
  door_wood: 'door_wood',
  door_steel: 'door_steel',
  door_iron_grate: 'door_iron_grate',
  door_stone: 'door_stone',
  door_shutter: 'door_shutter',
  door_saloon: 'door_saloon',
};

/**
 * How far a door's model is turned to stand in its leaf: along the leaf, its hinge at the end the
 * door turns on, the other end for a leaf hung the other way round.
 */
export function doorModelTurn(across: 'x' | 'y', mirrored: boolean): number {
  if (across === 'x') return mirrored ? 270 : 90;
  return mirrored ? 180 : 0;
}

/** The kinds of door the generator lets be hung in place of the one a place hangs. */
export const DOOR_KINDS = [
  'door_wood',
  'door_steel',
  'door_iron_grate',
  'door_stone',
  'door_shutter',
  'door_saloon',
] as const;

export type DoorKind = (typeof DOOR_KINDS)[number];

/** How each kind of door opens when it is chosen: a grate and a shutter go up, a slab of stone sinks, the rest swing. */
export const DOOR_KIND_STYLES: Readonly<Record<DoorKind, DungeonDoorStyle>> = {
  door_wood: 'swing',
  door_steel: 'swing',
  door_iron_grate: 'lift',
  door_stone: 'sink',
  door_shutter: 'lift',
  door_saloon: 'swing',
};

/** The doors that hang at waist height, which what stands on either side sees over. */
export const DOORS_SEEN_OVER: readonly DungeonPropId[] = ['door_saloon'];
