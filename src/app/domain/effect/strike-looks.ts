import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * What the blows of a fist or a blunt weapon are told apart by, and when each lands. A blow is written
 * one way and drawn three: at the lowest grade one hard straight jab, a fist of force drawn back and
 * driven in; at the middle grade a heavy swing brought down from overhead, which rings on what it
 * hits and sends it skidding; and at the highest a crushing blow, force gathered into the fist for a beat
 * and driven through the target and out of its back, shattering the ground under it.
 */

/** The blows a strike is drawn as. */
export type StrikeLook = 'jab' | 'swing' | 'crush';

/** The blow a strike is drawn as, by its grade: a jab, a swing and a crushing blow. */
export function strikeLookOf(preset: Pick<EffectPreset, 'gradeLevel'>): StrikeLook {
  return preset.gradeLevel === 1 ? 'jab' : preset.gradeLevel === 3 ? 'crush' : 'swing';
}

/** How long each blow is drawn back before it lands, in seconds, and at the most as a share of its playback. */
const DRAWN_BACK_FOR: Record<StrikeLook, readonly [seconds: number, share: number]> = {
  jab: [0.09, 0.12],
  swing: [0.22, 0.24],
  crush: [0.29, 0.14],
};

/** When a strike of a grade lands, in seconds of a playback of a length: once its blow has been drawn back. */
export function strikeLandsAt(grade: 1 | 2 | 3, durationS: number): number {
  const [seconds, share] = DRAWN_BACK_FOR[strikeLookOf({ gradeLevel: grade })];
  return Math.min(seconds, durationS * share);
}

/**
 * The way a strike that no one throws comes in along, over the floor and of length one: from a place
 * to the south-west of its target, towards the north-east.
 */
export const UNTHROWN_WAY = { x: Math.SQRT1_2, y: -Math.SQRT1_2 } as const;

/**
 * How far round from the way a blow drives it throws what it lands on, in radians, to the right of
 * the one who throws it: a swing carries it on round the way it sweeps; the rest drive it straight back.
 */
export function knockTurnOf(look: StrikeLook): number {
  return look === 'swing' ? 0.6 : 0;
}

/** Whether an effect is a strike on its own, rather than a run with one among its stages. */
export function strikesAlone(preset: Pick<EffectPreset, 'isStaged' | 'effectKind'>): boolean {
  return !preset.isStaged && preset.effectKind === 'bash';
}
