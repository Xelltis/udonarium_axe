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
  barrel: 'prop_barrel',
  pipe: 'prop_pipe',
  pipeValve: 'prop_pipeValve',
  pipeElbow: 'prop_pipeElbow',
  pipeEnd: 'prop_pipeEnd',
  neonCocktail: 'prop_neonCocktail',
  neonDice: 'prop_neonDice',
  neonHeart: 'prop_neonHeart',
  backBar: 'prop_backBar',
  boothSofa: 'prop_boothSofa',
  lowTable: 'prop_lowTable',
  jukebox: 'prop_jukebox',
  slotMachine: 'prop_slotMachine',
  arcadeCabinet: 'prop_arcadeCabinet',
  rouletteTable: 'prop_rouletteTable',
  vendingMachine: 'prop_vendingMachine',
  goodsShelf: 'prop_goodsShelf',
  safe: 'prop_safe',
  executiveDesk: 'prop_executiveDesk',
  still: 'prop_still',
  speaker: 'prop_speaker',
  aquarium: 'prop_aquarium',
  plant: 'prop_plant',
  bookshelf: 'prop_bookshelf',
  lectern: 'prop_lectern',
  bookPile: 'prop_bookPile',
  alchemyTable: 'prop_alchemyTable',
  cauldron: 'prop_cauldron',
  potionShelf: 'prop_potionShelf',
  magicCircle: 'prop_magicCircle',
  crystalPedestal: 'prop_crystalPedestal',
  orrery: 'prop_orrery',
  telescope: 'prop_telescope',
  canopyBed: 'prop_canopyBed',
  wardrobe: 'prop_wardrobe',
  treasureChest: 'prop_treasureChest',
  candelabra: 'prop_candelabra',
  gargoyle: 'prop_gargoyle',
  writingDesk: 'prop_writingDesk',
  storageJars: 'prop_storageJars',
  bed: 'prop_bed',
  tableWood: 'prop_tableWood',
  chairWood: 'prop_chairWood',
  cupboard: 'prop_cupboard',
  fireplace: 'prop_fireplace',
  anvil: 'prop_anvil',
  forge: 'prop_forge',
  weaponRack: 'prop_weaponRack',
  breadOven: 'prop_breadOven',
  flourSacks: 'prop_flourSacks',
  pew: 'prop_pew',
  altar: 'prop_altar',
  bunkBed: 'prop_bunkBed',
  chestWood: 'prop_chestWood',
  shelfGoods: 'prop_shelfGoods',
  barCounter: 'prop_barCounter',
  tavernCounter: 'prop_tavernCounter',
};

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
