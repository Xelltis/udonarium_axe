import { FieldPropId } from '@axe/domain/tabletop/field/field-atmosphere';
import { FieldPlan } from '@axe/domain/tabletop/field/field-generator';
import { buildFieldSummary } from '@axe/domain/tabletop/field/field-summary';
import { TranslateFn } from '@axe/features/tabletop/dungeon-generator/dungeon-notes';

/**
 * The text summary handed over with a generated field map, built from its plan and seed with labels
 * in the reader's language.
 */
export function describeField(plan: FieldPlan, name: string, seed: number, t: TranslateFn): string {
  return buildFieldSummary({
    ...plan,
    name,
    seed,
    labels: {
      seed: t('feature.tabletop.dungeonGenerator.summary.seed'),
      ground: t('feature.tabletop.dungeonGenerator.summary.ground'),
      standing: t('feature.tabletop.dungeonGenerator.summary.standing'),
      fires: t('feature.tabletop.dungeonGenerator.summary.fires'),
      textureName: (texture: string) => t(`common.textures.${texture}`),
      propName: (prop: FieldPropId | 'building') => t(`feature.tabletop.dungeonGenerator.prop.${prop}`),
    },
  });
}
