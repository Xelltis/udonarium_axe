import type { FieldPropId } from '@axe/domain/tabletop/field/field-atmosphere';

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
  'grass',
  'grass_large',
  'rock_largeA',
  'rock_smallA',
  'rock_tallA',
  'stone_largeA',
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
  boulder: ['rock_largeA', 'rock_smallA', 'stone_largeA'],
  outcrop: ['rock_tallA'],
};

/**
 * How large each bundled model is as it was made, the box round it, in its own units: across, the
 * wider of its two sides, and tall. Read once off the files, which a spec holds them to.
 */
export const FIELD_MODEL_SIZES: Readonly<Record<FieldModelId, { readonly across: number; readonly tall: number }>> = {
  tree_oak: { across: 4.551, tall: 6.9122 },
  tree_beech: { across: 5.6605, tall: 7.1151 },
  tree_birch: { across: 5.1837, tall: 7.1836 },
  tree_poplar: { across: 3.4201, tall: 7.6782 },
  tree_willow: { across: 6.01, tall: 5.9788 },
  tree_pine: { across: 4.8411, tall: 7.6849 },
  tree_dead: { across: 2.9819, tall: 4.7757 },
  tree_fir: { across: 3.9013, tall: 6.9648 },
  tree_spruce: { across: 4.7923, tall: 6.636 },
  bush_round: { across: 1.848, tall: 1.0804 },
  bush_wide: { across: 2.3952, tall: 1.6323 },
  bush_leafy: { across: 2.1843, tall: 1.2968 },
  grass: { across: 0.3922, tall: 0.254 },
  grass_large: { across: 0.409, tall: 0.254 },
  rock_largeA: { across: 1.0155, tall: 0.2598 },
  rock_smallA: { across: 0.3608, tall: 0.1912 },
  rock_tallA: { across: 0.9831, tall: 0.9959 },
  stone_largeA: { across: 1.0155, tall: 0.2598 },
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

/** Which of a thing's models stands at a cell, the same for the same field each time. */
export function fieldModelAt(prop: FieldPropId, x: number, y: number, seed: number): FieldModelId | null {
  const models = FIELD_PROP_MODELS[prop];
  if (!models?.length) return null;
  const mixed = Math.imul(x * 73856093 + y * 19349663 + seed, 2654435761) >>> 0;
  return models[mixed % models.length];
}
