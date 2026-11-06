import type { FieldAtmosphereId, FieldPropId } from '@axe/domain/tabletop/field/field-atmosphere';

/** The 3D models bundled with the app that open country can be stood with. */
export const FIELD_MODEL_IDS = [
  'tree_oak',
  'tree_beech',
  'tree_birch',
  'tree_poplar',
  'tree_willow',
  'tree_pine',
  'tree_dead',
  'tree_fir',
  'tree_spruce',
  'bush_round',
  'bush_wide',
  'bush_leafy',
  'rock_boulder',
  'rock_angular',
  'rock_slab',
  'rock_outcrop',
] as const;

export type FieldModelId = (typeof FIELD_MODEL_IDS)[number];

/** Where a bundled model's bytes are served from, beside the page. */
export function fieldModelUrl(id: FieldModelId): string {
  return `assets/models/nature/${id}.glb`;
}

/**
 * The bundled models each standing thing of open country may be drawn as, one of which is chosen
 * for each by where it stands. A thing with none is built of its blocks as ever.
 */
export const FIELD_PROP_MODELS: Readonly<Partial<Record<FieldPropId, readonly FieldModelId[]>>> = {
  tree: ['tree_oak', 'tree_beech', 'tree_birch', 'tree_fir', 'tree_spruce'],
  streetTree: ['tree_beech', 'tree_poplar', 'tree_birch'],
  bush: ['bush_round', 'bush_wide', 'bush_leafy'],
  boulder: ['rock_boulder', 'rock_angular', 'rock_slab'],
  outcrop: ['rock_outcrop'],
};

/**
 * The trees a mood of open country grows in place of those of a wood: the broadleaves of open
 * grassland, the willows and dead trees of a marsh, the evergreens of snow.
 */
export const FIELD_MOOD_PROP_MODELS: Readonly<
  Partial<Record<FieldAtmosphereId, Readonly<Partial<Record<FieldPropId, readonly FieldModelId[]>>>>>
> = {
  meadow: { tree: ['tree_oak', 'tree_beech', 'tree_poplar', 'tree_birch'] },
  marsh: { tree: ['tree_willow', 'tree_birch', 'tree_dead'] },
  snowfield: { tree: ['tree_fir', 'tree_spruce', 'tree_pine', 'tree_dead'] },
};

/** How many cells across a stand of one kind of tree grows, before the next may be of another kind. */
const GROVE_CELLS = 6;

/**
 * How large each bundled model is as it was made, the box round it, in its own units: across, the
 * wider of its two sides, and tall. Read once off the files, which a spec holds them to.
 */
export const FIELD_MODEL_SIZES: Readonly<Record<FieldModelId, { readonly across: number; readonly tall: number }>> = {
  tree_oak: { across: 11.1336, tall: 15.1729 },
  tree_beech: { across: 10.1713, tall: 16.6659 },
  tree_birch: { across: 8.6392, tall: 15.4307 },
  tree_poplar: { across: 4.2466, tall: 18.4372 },
  tree_willow: { across: 7.8655, tall: 10.0769 },
  tree_pine: { across: 10.7923, tall: 18.3302 },
  tree_dead: { across: 8.3995, tall: 11.1466 },
  tree_fir: { across: 8.226, tall: 13.998 },
  tree_spruce: { across: 7.3256, tall: 12.995 },
  bush_round: { across: 1.848, tall: 1.0804 },
  bush_wide: { across: 2.3952, tall: 1.6323 },
  bush_leafy: { across: 2.1843, tall: 1.2968 },
  rock_boulder: { across: 1.3556, tall: 0.7302 },
  rock_angular: { across: 1.1457, tall: 0.6974 },
  rock_slab: { across: 1.3424, tall: 0.5183 },
  rock_outcrop: { across: 1.2821, tall: 1.064 },
};

/**
 * How wide and how tall a bundled model is drawn, in cells, to stand as large as it may within a box
 * so many cells across and so many tall: as the table draws a model, the box's narrower measure for
 * the model setting how large it is.
 */
export function fieldModelDrawnSize(
  model: FieldModelId,
  acrossCells: number,
  tallCells: number
): { readonly across: number; readonly tall: number } {
  const size = FIELD_MODEL_SIZES[model];
  const fitted = Math.min(acrossCells / size.across, tallCells / size.tall);
  return { across: fitted * size.across, tall: fitted * size.tall };
}

/**
 * Which of a thing's models stands at a cell, the same for the same field each time: those its mood
 * grows, or else those of a wood. Most cells take the kind of the stand they lie in, so that trees of
 * a kind grow together; one in four takes a kind of its own.
 */
export function fieldModelAt(
  prop: FieldPropId,
  x: number,
  y: number,
  seed: number,
  mood?: FieldAtmosphereId
): FieldModelId | null {
  const models = (mood && FIELD_MOOD_PROP_MODELS[mood]?.[prop]) || FIELD_PROP_MODELS[prop];
  if (!models?.length) return null;
  const own = mixed(x, y, seed);
  const stand = mixed(Math.floor(x / GROVE_CELLS), Math.floor(y / GROVE_CELLS), seed + 1);
  return models[(own % 4 === 0 ? own >>> 2 : stand) % models.length];
}

function mixed(x: number, y: number, seed: number): number {
  return Math.imul(x * 73856093 + y * 19349663 + seed, 2654435761) >>> 0;
}
