import type { FurnishingId } from '@axe/domain/tabletop/dungeon/dungeon-layout';

/** The 3D models bundled with the app that the furniture of a dungeon can be stood as. */
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
