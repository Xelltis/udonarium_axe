import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * Which bolts are shots of spirit, of a curse and of holy light. A bolt of no element is told by what
 * it lands in and by its family: one that lands in light that smites or heals, or is of the holy
 * family, is a spear of light; one that lands in a miasma, a curse, a draining or a crushing weight,
 * or is of the dark family, is a knot of a curse; one that lands in an impact is spirit pressed into
 * a ball, which is gathered at the hands before it is thrown. Any other is a bolt of magic. The shots
 * of fire, wind, rock and lightning are told before these, each by its own rule.
 */

/** What a bolt of no element is drawn as. */
export type MagicShot = 'spirit' | 'curse' | 'holy' | 'arcane';

const HOLY_LANDINGS: ReadonlySet<string> = new Set(['smite', 'halo', 'sanctuary', 'heal']);
const DARK_LANDINGS: ReadonlySet<string> = new Set(['miasma', 'curse', 'drain', 'gravity']);
/** The families whose bolts are of their own element, whatever they land in. */
const ELEMENTS: ReadonlySet<string> = new Set(['炎', '氷', '雷', '風', '土', '状態異常', '回復', '強化']);

/** How long spirit is gathered at the hands before a shot of it is thrown, in milliseconds. */
export const SPIRIT_GATHERS_MS = 200;

/** What a bolt is drawn as where it is of no element: see the header. */
export function magicShotOf(preset: EffectPreset): MagicShot {
  const family = preset.tagName.trim();
  const landsIn = preset.impactEffectKind;
  if (family === '聖' || HOLY_LANDINGS.has(landsIn)) return 'holy';
  if (family === '闇' || DARK_LANDINGS.has(landsIn)) return 'curse';
  if (landsIn === 'impact' && !ELEMENTS.has(family)) return 'spirit';
  return 'arcane';
}

/** Whether a shot is a shot of spirit, gathered before it is thrown: a bolt on its own that is drawn as one. */
export function isSpiritShot(preset: EffectPreset): boolean {
  return (
    !preset.isStaged &&
    preset.effectKind === 'projectile' &&
    preset.projectileLook === 'bolt' &&
    magicShotOf(preset) === 'spirit'
  );
}
