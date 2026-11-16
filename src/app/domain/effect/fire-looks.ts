import { EFFECT_MOTE_OPTIONS, effectMoteOf } from '@axe/domain/effect/effect-motes';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { isFlame } from '@axe/domain/effect/scene/effect-ramp';

/*
 * Which shots are shots of fire. A bolt that lands in fire, in a burst, a blaze or a great blast, and
 * is of the colour of flame is a shot of fire, a dart or a ball of flame that trails fire behind it,
 * unless it is of another element.
 */

/** The looks of fire a shot may land in. */
const FIRE_LANDINGS: ReadonlySet<string> = new Set(['burst', 'flame', 'nova', 'mushroom']);
/** The families that have an element other than fire: a shot of one of them is of that element, whatever it lands in. */
const OTHER_ELEMENTS: ReadonlySet<string> = new Set(['氷', '雷', '風', '闇', '状態異常', '土', '回復', '強化']);
/** The particles of the other elements: a shot that carries one of them along its way is of that element. */
const OTHER_MOTES: ReadonlySet<string> = new Set(['frost', 'arc', 'leaf', 'haze']);

/**
 * Whether a shot is a shot of fire: a bolt of the colour of flame that lands in fire, unless what it
 * carries along its way says it is of another element. Its own choice of particle says first, and
 * with none chosen its family says. Any other shot is drawn as its look has it.
 */
export function isFireShot(preset: EffectPreset): boolean {
  if (preset.effectKind !== 'projectile' || preset.projectileLook !== 'bolt') return false;
  if (!FIRE_LANDINGS.has(preset.impactEffectKind) || !isFlame(preset.colorSecondary)) return false;
  const chosen = preset.moteStyle !== '' && EFFECT_MOTE_OPTIONS.includes(preset.moteStyle);
  return chosen ? !OTHER_MOTES.has(effectMoteOf(preset)) : !OTHER_ELEMENTS.has(preset.tagName.trim());
}
