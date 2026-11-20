import type { DungeonPropId } from '@axe/domain/media/texture-catalog';
import type { DungeonDoorStyle } from '@axe/domain/tabletop/dungeon/dungeon-atmosphere';
import { FURNISHING_IDS, type FurnishingId } from '@axe/domain/tabletop/dungeon/dungeon-layout';

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
  'prop_drainPipe',
  'prop_barrel',
  'prop_ladder',
  'prop_pipe',
  'prop_pipeValve',
  'prop_pipeElbow',
  'prop_pipeEnd',
  'prop_neonCocktail',
  'prop_neonDice',
  'prop_neonHeart',
  'prop_backBar',
  'prop_boothSofa',
  'prop_lowTable',
  'prop_jukebox',
  'prop_slotMachine',
  'prop_arcadeCabinet',
  'prop_rouletteTable',
  'prop_vendingMachine',
  'prop_goodsShelf',
  'prop_safe',
  'prop_executiveDesk',
  'prop_still',
  'prop_speaker',
  'prop_aquarium',
  'prop_plant',
  'prop_barCounter',
  'prop_tavernCounter',
  'prop_bookshelf',
  'prop_lectern',
  'prop_bookPile',
  'prop_alchemyTable',
  'prop_cauldron',
  'prop_potionShelf',
  'prop_magicCircle',
  'prop_crystalPedestal',
  'prop_orrery',
  'prop_telescope',
  'prop_canopyBed',
  'prop_wardrobe',
  'prop_treasureChest',
  'prop_candelabra',
  'prop_gargoyle',
  'prop_writingDesk',
  'prop_storageJars',
  'prop_bed',
  'prop_tableWood',
  'prop_chairWood',
  'prop_cupboard',
  'prop_fireplace',
  'prop_anvil',
  'prop_forge',
  'prop_weaponRack',
  'prop_breadOven',
  'prop_flourSacks',
  'prop_pew',
  'prop_altar',
  'prop_bunkBed',
  'prop_chestWood',
  'prop_shelfGoods',
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
 * The pieces of furniture stood as a model named otherwise than `prop_` and the piece's own name, as
 * the bar's table is stood as the model it was made as.
 */
const MODELS_NAMED_OTHERWISE: Readonly<Partial<Record<FurnishingId, FurnishingModelId>>> = { table: 'prop_barTable' };

/**
 * The model each piece of furniture is stood as: the bundled one named `prop_` and the piece's name,
 * or as `MODELS_NAMED_OTHERWISE` says. A piece no bundled model is named for has none, as a pillar,
 * which is of the walls' own stone and as tall as they are, both of which the generator lets be
 * chosen, so it is built of its blocks as ever.
 */
export const FURNISHING_MODELS: Readonly<Partial<Record<FurnishingId, FurnishingModelId>>> = Object.fromEntries(
  FURNISHING_IDS.flatMap((piece) => {
    const named = MODELS_NAMED_OTHERWISE[piece] ?? `prop_${piece}`;
    return isFurnishingModel(named) ? [[piece, named]] : [];
  })
);

/** The pieces whose model is one cell of a run: a counter of any length is a row of them, ends meeting. */
export const FURNISHING_SEGMENT_MODELS: readonly FurnishingId[] = [
  'counter',
  'shopCounter',
  'barCounter',
  'tavernCounter',
];

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
