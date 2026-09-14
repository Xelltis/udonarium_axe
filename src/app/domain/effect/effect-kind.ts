export type EffectKind =
  | 'slash'
  | 'projectile'
  | 'burst'
  | 'flame'
  | 'nova'
  | 'mushroom'
  | 'heal'
  | 'impact'
  | 'rubble'
  | 'upheaval'
  | 'bolt'
  | 'frost'
  | 'vortex'
  | 'miasma'
  | 'aura'
  | 'breath'
  | 'barrier'
  | 'drain'
  | 'warp'
  | 'gravity'
  | 'arc'
  | 'bash'
  | 'curse'
  | 'beam'
  | 'dissolve'
  | 'gore'
  | 'bisect'
  | 'skyblade'
  | 'raybeam'
  | 'arrowrain'
  | 'ballistic';

export type EffectTargeting = 'self' | 'single' | 'multi';

/**
 * The form of a cut, which decides the line of the blade rather than the grade does.
 * One stroke, a combination, a drawing cut, a sweep or a downward cleave.
 */
export type SlashStyle = 'single' | 'combo' | 'iai' | 'wide' | 'heavy';

const SLASH_STYLES: readonly SlashStyle[] = ['single', 'combo', 'iai', 'wide', 'heavy'];
const SLASH_STYLE_SET = new Set<string>(SLASH_STYLES);

/** Whether a stored value names a known form of cut. */
export function isSlashStyle(value: unknown): value is SlashStyle {
  return typeof value === 'string' && SLASH_STYLE_SET.has(value);
}

/**
 * What a projectile looks like: a magical bolt glows, while an arrow or a bullet flies as a thing.
 * A flying cut, a blaster bolt, a sniper's tracer, a small missile or a guided one.
 */
export type ProjectileStyle = 'bolt' | 'arrow' | 'bullet' | 'crescent' | 'blaster' | 'tracer' | 'missile' | 'cruise';

export const PROJECTILE_STYLES: readonly ProjectileStyle[] = [
  'bolt',
  'arrow',
  'bullet',
  'crescent',
  'blaster',
  'tracer',
  'missile',
  'cruise',
];

const PROJECTILE_STYLE_SET = new Set<string>(PROJECTILE_STYLES);

/** Whether a stored value names a known look of projectile. */
export function isProjectileStyle(value: unknown): value is ProjectileStyle {
  return typeof value === 'string' && PROJECTILE_STYLE_SET.has(value);
}

export const EFFECT_KINDS: readonly EffectKind[] = [
  'slash',
  'projectile',
  'burst',
  'flame',
  'nova',
  'mushroom',
  'heal',
  'impact',
  'rubble',
  'upheaval',
  'bolt',
  'frost',
  'vortex',
  'miasma',
  'aura',
  'breath',
  'barrier',
  'drain',
  'warp',
  'gravity',
  'arc',
  'bash',
  'curse',
  'beam',
  'dissolve',
  'gore',
  'bisect',
  'skyblade',
  'raybeam',
  'arrowrain',
  'ballistic',
];

export const EFFECT_TARGETINGS: readonly EffectTargeting[] = ['self', 'single', 'multi'];

const EFFECT_KIND_SET = new Set<string>(EFFECT_KINDS);
const EFFECT_TARGETING_SET = new Set<string>(EFFECT_TARGETINGS);

/** Whether a stored value names a look the tool knows how to draw. */
export function isEffectKind(value: unknown): value is EffectKind {
  return typeof value === 'string' && EFFECT_KIND_SET.has(value);
}

/** Whether a stored value names a known way of choosing targets: the caster, one piece or several. */
export function isEffectTargeting(value: unknown): value is EffectTargeting {
  return typeof value === 'string' && EFFECT_TARGETING_SET.has(value);
}
