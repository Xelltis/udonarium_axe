import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * What the looks that heal, guard and strengthen are told apart by. A healing is written one way and
 * drawn five: by its grade it mends, life welling up out of the floor into the one it is laid on; it
 * rains, light poured down on each from a ring opened over its head; or it is a grace, a dome of light
 * raised over all it takes in. And where the particles it names say so it cleanses instead: at the
 * lowest grade it purges, a ring of water driven up the body and what ails it driven out before it,
 * and above that it washes, a wave run down the body that carries what ails it off over the floor.
 * Like the states of a curse a cleansing is told by its particles and not by a kind of its own: a
 * room shared with a version of the tool that has never heard of it draws it as a healing.
 *
 * A barrier is a ward, a dome of panes, or at the highest grade a mirror, a crystal of bright faces
 * that throws back what strikes it. An aura burns about its piece, and the greatest of them gathers
 * and breaks out.
 */

/** The particles a healing names to be drawn as a cleansing. */
export const CLEANSING_MOTES = 'cleanse';

/** The looks a healing is drawn as. */
export type HealLook = 'mend' | 'rain' | 'grace' | 'purge' | 'wash';

/** The look a healing is drawn as, by the particles it names and its grade. */
export function healLookOf(preset: Pick<EffectPreset, 'moteStyle' | 'gradeLevel'>): HealLook {
  if (preset.moteStyle === CLEANSING_MOTES) return preset.gradeLevel === 1 ? 'purge' : 'wash';
  return preset.gradeLevel === 1 ? 'mend' : preset.gradeLevel === 3 ? 'grace' : 'rain';
}

/** Whether a barrier is the mirror that throws back what strikes it: one of the highest grade. */
export function isMirror(preset: Pick<EffectPreset, 'gradeLevel'>): boolean {
  return preset.gradeLevel === 3;
}

/** Whether an effect is a grace on its own: the healing that lifts those it is laid on off the floor. */
export function liftsAsGrace(
  preset: Pick<EffectPreset, 'isStaged' | 'effectKind' | 'moteStyle' | 'gradeLevel'>
): boolean {
  return !preset.isStaged && preset.effectKind === 'heal' && healLookOf(preset) === 'grace';
}

/** Where through its playback a grace raises its dome and lets those under it down again, as shares of it. */
export const GRACE_RISES_AT = 0.19;
export const GRACE_SETS_DOWN_AT = 0.74;
