import type { FieldPropId } from '@axe/domain/tabletop/field/field-atmosphere';

/** The 3D models bundled with the app that open country can be stood with. */
export const FIELD_MODEL_IDS = [
  'tree_oak',
  'tree_default',
  'tree_pineTallA',
  'tree_pineRoundB',
  'plant_bush',
  'plant_bushLarge',
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
  tree: ['tree_oak', 'tree_default', 'tree_pineTallA', 'tree_pineRoundB'],
  streetTree: ['tree_default', 'tree_oak'],
  bush: ['plant_bush', 'plant_bushLarge'],
  boulder: ['rock_largeA', 'rock_smallA', 'stone_largeA'],
  outcrop: ['rock_tallA'],
};

/**
 * How large each bundled model is as it was made, the box round it, in its own units: across, the
 * wider of its two sides, and tall. Read once off the files, which a spec holds them to.
 */
export const FIELD_MODEL_SIZES: Readonly<Record<FieldModelId, { readonly across: number; readonly tall: number }>> = {
  tree_oak: { across: 0.7396, tall: 1.2262 },
  tree_default: { across: 0.755, tall: 1.7079 },
  tree_pineTallA: { across: 0.392, tall: 1.5296 },
  tree_pineRoundB: { across: 0.6132, tall: 1.1959 },
  plant_bush: { across: 0.396, tall: 0.2444 },
  plant_bushLarge: { across: 0.3743, tall: 0.2429 },
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
