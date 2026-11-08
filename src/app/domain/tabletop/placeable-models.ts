import { bundledModelUrl } from '@axe/domain/tabletop/bundled-model-url';

/** The shelves the bundled models that may be painted onto a map are kept on, in the order offered. */
export const PLACEABLE_MODEL_GROUPS = ['nature', 'furnishing', 'settlement', 'town'] as const;

export type PlaceableModelGroup = (typeof PLACEABLE_MODEL_GROUPS)[number];

/** A bundled 3D model that may be painted onto a map, and how it stands there unless told otherwise. */
export interface PlaceableModel {
  readonly id: string;
  readonly group: PlaceableModelGroup;
  /** How wide, deep and tall it was made, in its own units: only the proportions are read. */
  readonly made: { readonly wide: number; readonly deep: number; readonly tall: number };
  /** How many cells across it stands unless told otherwise. */
  readonly size: number;
  /** Whether a piece has to walk round it, rather than over it. */
  readonly blocksMove: boolean;
  /** Whether nobody sees past it; only a thing that stands in the way can. */
  readonly blocksSight: boolean;
}

type Row = readonly [
  id: string,
  wide: number,
  deep: number,
  tall: number,
  size: number,
  blocksMove: boolean,
  blocksSight: boolean,
];

/**
 * A size given as how tall a thing of open country stands, in cells, read back as how many cells
 * across that makes it: the models of open country are made to a scale of their own.
 */
function acrossAtTall(wide: number, deep: number, tall: number, tallCells: number): number {
  return Math.round(((tallCells * Math.max(wide, deep)) / tall) * 100) / 100;
}

function grown(
  id: string,
  wide: number,
  deep: number,
  tall: number,
  tallCells: number,
  move: boolean,
  sight: boolean
): Row {
  return [id, wide, deep, tall, acrossAtTall(wide, deep, tall, tallCells), move, sight];
}

/** How tall a tree of open country stands, in cells, as a field grows it. */
const TREE_CELLS = 3.4;

/**
 * The models of open country, measured from their files. Trees, rocks and cacti stand in the way;
 * a bush, a slab of rock and a heap of junk are walked over. Only the trees and an outcrop hide
 * what is behind them.
 */
const NATURE: readonly Row[] = [
  grown('tree_oak', 11.134, 10.014, 15.173, TREE_CELLS, true, true),
  grown('tree_beech', 10.171, 9.205, 16.666, TREE_CELLS, true, true),
  grown('tree_birch', 8.129, 8.639, 15.431, TREE_CELLS, true, true),
  grown('tree_poplar', 4.247, 3.625, 18.437, TREE_CELLS, true, true),
  grown('tree_willow', 6.107, 7.866, 10.077, TREE_CELLS, true, true),
  grown('tree_pine', 10.792, 9.047, 18.33, TREE_CELLS, true, true),
  grown('tree_fir', 7.011, 8.226, 13.998, TREE_CELLS, true, true),
  grown('tree_spruce', 6.057, 7.326, 12.995, TREE_CELLS, true, true),
  grown('tree_dead', 8.399, 8.175, 11.147, TREE_CELLS, true, true),
  grown('tree_cherry', 8.225, 6.467, 11.605, TREE_CELLS, true, true),
  grown('tree_maple', 7.652, 7.095, 9.416, TREE_CELLS, true, true),
  grown('tree_ginkgo', 10.673, 10.399, 17.218, TREE_CELLS, true, true),
  grown('tree_mangrove', 7.4, 6.695, 9.348, TREE_CELLS, true, true),
  grown('tree_oakAutumn', 11.134, 10.014, 15.173, TREE_CELLS, true, true),
  grown('tree_beechAutumn', 10.171, 9.205, 16.666, TREE_CELLS, true, true),
  grown('tree_birchAutumn', 8.129, 8.639, 15.431, TREE_CELLS, true, true),
  grown('tree_oakBare', 7.489, 8.686, 14.346, TREE_CELLS, true, true),
  grown('tree_birchBare', 6.14, 5.663, 14.601, TREE_CELLS, true, true),
  grown('tree_snowFir', 7.011, 8.226, 13.998, TREE_CELLS, true, true),
  grown('tree_snowSpruce', 6.057, 7.326, 12.995, TREE_CELLS, true, true),
  grown('tree_giant', 19.196, 22.935, 21.355, 6, true, true),
  grown('bush_round', 1.657, 1.848, 1.08, 0.6, false, false),
  grown('bush_wide', 2.188, 2.395, 1.632, 0.7, false, false),
  grown('bush_leafy', 1.992, 2.184, 1.297, 0.6, false, false),
  grown('rock_boulder', 1.356, 1.132, 0.73, 0.7, true, false),
  grown('rock_angular', 1.146, 1.029, 0.697, 0.6, true, false),
  grown('rock_slab', 1.342, 1.125, 0.518, 0.45, false, false),
  grown('rock_outcrop', 1.282, 1.097, 1.064, 1.2, true, true),
  grown('cactus_saguaro', 0.755, 0.432, 1.498, 1.5, true, false),
  grown('cactus_tall', 0.365, 0.458, 1.598, 1.5, true, false),
  grown('junk_heap', 1.233, 1.14, 0.357, 0.4, false, false),
  grown('junk_drums', 1.024, 1.075, 0.568, 0.6, true, false),
];

/**
 * The furniture, made a unit to the cell. The doors are left to the terrain's own doors, which open;
 * the shipping containers alone are tall enough to hide behind, and rubble is walked over.
 */
const FURNISHING: readonly Row[] = [
  ['prop_crate', 1.002, 1.002, 0.78, 1, true, false],
  ['prop_stool', 0.47, 0.47, 0.752, 0.47, true, false],
  ['prop_desk', 1.2, 0.684, 0.74, 1.2, true, false],
  ['prop_gamingTable', 1.3, 0.9, 0.83, 1.3, true, false],
  ['prop_counter', 1, 0.8, 0.55, 1, true, false],
  ['prop_shopCounter', 1, 0.8, 0.55, 1, true, false],
  ['prop_barTable', 0.844, 0.844, 0.582, 0.84, true, false],
  ['prop_rubble', 0.627, 1.074, 0.354, 1.07, false, false],
  ['prop_containerRed', 4.012, 2.004, 1.7, 4, true, true],
  ['prop_containerBlue', 4.012, 2.004, 1.7, 4, true, true],
  ['prop_containerGreen', 4.012, 2.004, 1.7, 4, true, true],
];

/**
 * The walls, the fences and the things of a village or a fort, made a unit to the cell. A wall joins
 * the walls beside it and a crop fills its cell, so each of those stands a whole cell across; crops
 * and a hearth are walked over, and a fence is seen over.
 */
const SETTLEMENT: readonly Row[] = [
  ['log_wall', 1, 1, 1, 1, true, true],
  ['plank_wall', 1, 1, 1.016, 1, true, true],
  ['timber_frame_wall', 1, 1, 1, 1, true, true],
  ['hide_wall', 1, 1, 1.077, 1, true, true],
  ['stone_room_wall', 1, 1, 1, 1, true, true],
  ['rail_fence', 1, 1, 1, 1, true, false],
  ['palisade_spikes', 1, 1, 1.014, 1, true, true],
  ['stone_wall_battlement', 1, 1, 1, 1, true, true],
  ['stone_tower_round', 3.029, 3.024, 5, 3, true, true],
  ['stone_tower_square', 2.002, 3.002, 5, 3, true, true],
  ['watchtower_wood', 2.488, 2.488, 4.003, 2.5, true, true],
  ['totem', 0.855, 0.4, 2.45, 0.86, true, false],
  ['well', 0.92, 0.84, 1.08, 0.92, true, false],
  ['cart', 1.396, 0.801, 0.56, 1.4, true, false],
  ['hay', 0.66, 0.76, 0.66, 0.76, true, false],
  ['hearth', 0.885, 0.848, 0.167, 0.88, false, false],
  ['crop_wheat', 1, 1, 0.739, 1, false, false],
  ['crop_rice', 1, 1, 0.571, 1, false, false],
  ['crop_corn', 1, 1, 1.523, 1, false, false],
  ['crop_vegetable', 1, 1, 0.218, 1, false, false],
];

/** What stands on the roofs of a town; its buildings are built of their facades, not painted cell by cell. */
const TOWN: readonly Row[] = [
  ['roof_plant', 0.714, 0.714, 0.565, 0.71, true, false],
  ['roof_tank', 0.571, 0.58, 0.7, 0.58, true, false],
];

function shelved(group: PlaceableModelGroup, rows: readonly Row[]): PlaceableModel[] {
  return rows.map(([id, wide, deep, tall, size, blocksMove, blocksSight]) => ({
    id,
    group,
    made: { wide, deep, tall },
    size,
    blocksMove,
    blocksSight,
  }));
}

/** Every bundled model that may be painted onto a map, shelf by shelf. */
export const PLACEABLE_MODELS: readonly PlaceableModel[] = [
  ...shelved('nature', NATURE),
  ...shelved('furnishing', FURNISHING),
  ...shelved('settlement', SETTLEMENT),
  ...shelved('town', TOWN),
];

const BY_ID = new Map(PLACEABLE_MODELS.map((model) => [model.id, model]));

/** Where the pictures the bundled models are shown by are served from, beside the page. */
const MODEL_PICTURES = 'assets/images/model-pictures';

/** The bundled model of a name that may be painted onto a map, or null for any other name. */
export function placeableModelOf(id: string): PlaceableModel | null {
  return BY_ID.get(id) ?? null;
}

/** Whether a name is one of the bundled models, rather than a model held in the room. */
export function isBundledModelName(id: string): boolean {
  return bundledModelUrl(id) !== null;
}

/**
 * Where the picture of a bundled model seen from straight above is served from, as wide and deep as
 * the model is, which a map shows it by; null for a name no bundled model has.
 */
export function placeableModelTopUrl(id: string): string | null {
  return BY_ID.has(id) ? `${MODEL_PICTURES}/${id}.top.webp` : null;
}

/** Where the picture of a bundled model seen from above and aside is served from, which a list shows it by. */
export function placeableModelIconUrl(id: string): string | null {
  return BY_ID.has(id) ? `${MODEL_PICTURES}/${id}.icon.webp` : null;
}

/** The i18n key naming a bundled model that may be painted onto a map. */
export function placeableModelLabelKey(id: string): string {
  return `feature.mapEditor.object.model_${id}`;
}

/** The i18n key naming a shelf of the bundled models. */
export function placeableModelGroupLabelKey(group: PlaceableModelGroup): string {
  return `feature.mapEditor.object.group_${group}`;
}
