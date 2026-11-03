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

/** Which of a thing's models stands at a cell, the same for the same field each time. */
export function fieldModelAt(prop: FieldPropId, x: number, y: number, seed: number): FieldModelId | null {
  const models = FIELD_PROP_MODELS[prop];
  if (!models?.length) return null;
  const mixed = Math.imul(x * 73856093 + y * 19349663 + seed, 2654435761) >>> 0;
  return models[mixed % models.length];
}
