import type { WallTextureId } from '@axe/domain/media/texture-catalog';
import type { TownPlan } from '@axe/domain/tabletop/field/field-atmosphere';

/**
 * The 3D models bundled with the app that a town can be built of: a kit for each facade, a wall one
 * cell wide and one storey tall with a roof and a parapet, which the table repeats to make a building
 * of any size; and what stands on a roof.
 */
export const TOWN_MODEL_IDS = [
  'town_office',
  'town_concrete',
  'town_sfGlass',
  'town_sfPanel',
  'town_brick',
  'town_brownstone',
  'town_shack',
  'roof_plant',
  'roof_tank',
] as const;

export type TownModelId = (typeof TOWN_MODEL_IDS)[number];

/** Whether a bundled model's name is one of a town's. */
export function isTownModel(id: string): id is TownModelId {
  return (TOWN_MODEL_IDS as readonly string[]).includes(id);
}

/** Where a bundled piece of a town's bytes are served from, beside the page. */
export function townModelUrl(id: TownModelId): string {
  return `assets/models/town/${id}.glb`;
}

/** The kit a building is built of, by the facade it wears: the same picture, with what it shows built out of it. */
export const TOWN_KITS: Readonly<Partial<Record<WallTextureId, TownModelId>>> = {
  wall_facade: 'town_office',
  wall_facade_concrete: 'town_concrete',
  wall_sf_glass: 'town_sfGlass',
  wall_sf_panel: 'town_sfPanel',
  wall_brick_tenement: 'town_brick',
  wall_brownstone: 'town_brownstone',
  wall_corrugated: 'town_shack',
};

/** What stands on a town's roofs: a wooden water tank where the town keeps its water in tubs, a plant room elsewhere. */
export function roofUnitModelOf(plan: Pick<TownPlan, 'plantSkin'>): TownModelId {
  return plan.plantSkin?.side === 'wood_plank' ? 'roof_tank' : 'roof_plant';
}
