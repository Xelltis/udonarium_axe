import { EffectPreset } from '@axe/domain/effect/effect-preset';

/**
 * The particles scattered along the way.
 *
 * A cone and a colour alone would look like the same thing flying in different colours,
 * while different things in the air say what is coming before the colour does.
 */
export type EffectMote = 'spark' | 'frost' | 'arc' | 'leaf' | 'haze' | 'none';

const MOTE_BY_TAG: Record<string, EffectMote> = {
  炎: 'spark',
  氷: 'frost',
  雷: 'arc',
  風: 'leaf',
  闇: 'haze',
  状態異常: 'haze',
  土: 'spark',
  射撃: 'spark',
  回復: 'frost',
  強化: 'spark',
};

const MOTE_STYLES: readonly EffectMote[] = ['spark', 'frost', 'arc', 'leaf', 'haze', 'none'];

/** Whether a stored value names a known kind of particle. Empty is not one; it leaves the choice to the family. */
export function isEffectMote(value: unknown): value is EffectMote {
  return typeof value === 'string' && MOTE_STYLES.includes(value as EffectMote);
}

/** What is given outright wins; otherwise the family decides. */
export function effectMoteOf(preset: EffectPreset): EffectMote {
  if (isEffectMote(preset.moteStyle)) return preset.moteStyle;
  return MOTE_BY_TAG[preset.tagName.trim()] ?? 'spark';
}

export const EFFECT_MOTE_OPTIONS: readonly string[] = ['', ...MOTE_STYLES];
