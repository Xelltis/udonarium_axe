import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * What the looks of holy light are told apart by, and when each of them strikes. Light that smites is
 * written one way and drawn three: at the lowest grade a seal kindles over the target's head and one
 * thin pillar drops through it; at the middle grade a thick pillar falls out of the sky on each target
 * in turn; and at the highest the clouds part and one immense light comes down over all it takes in.
 * A halo closes on its target and bursts, and a sanctuary opens a crest on the floor and raises walls
 * of light from its rim. All three strike once, after a moment in which they are seen coming.
 */

/** The lights a smiting is drawn as. */
export type SmiteLook = 'seal' | 'judgement' | 'heaven';

/** The light a smiting is drawn as, by its grade: a seal, a judgement, and the light of heaven. */
export function smiteLookOf(preset: Pick<EffectPreset, 'gradeLevel'>): SmiteLook {
  return preset.gradeLevel === 1 ? 'seal' : preset.gradeLevel === 3 ? 'heaven' : 'judgement';
}

/** How long each light is seen coming before it strikes, in seconds, and at the most as a share of its playback. */
const COMES_FOR: Record<SmiteLook | 'halo' | 'sanctuary', readonly [seconds: number, share: number]> = {
  seal: [0.34, 0.4],
  judgement: [0.5, 0.4],
  heaven: [1.1, 0.45],
  halo: [1, 0.5],
  sanctuary: [0.9, 0.45],
};

/**
 * When a look of holy light strikes, in seconds of a playback of a length: the pillar of a smiting
 * landing, a halo bursting, the walls of a sanctuary rising. Nothing for a look of any other kind.
 */
export function holyStrikesAt(kind: EffectKind, grade: 1 | 2 | 3, durationS: number): number | undefined {
  const look = kind === 'smite' ? smiteLookOf({ gradeLevel: grade }) : kind;
  if (look !== 'seal' && look !== 'judgement' && look !== 'heaven' && look !== 'halo' && look !== 'sanctuary') {
    return undefined;
  }
  const [seconds, share] = COMES_FOR[look];
  return Math.min(seconds, durationS * share);
}

type Lone = Pick<EffectPreset, 'isStaged' | 'effectKind'>;

/**
 * Whether an effect strikes from straight above, on its own rather than as a stage of a run: a light
 * that smites, which presses what it strikes down rather than throwing it back from its caster.
 */
export function fallsFromAbove(preset: Lone): boolean {
  return !preset.isStaged && preset.effectKind === 'smite';
}

/**
 * Whether an effect bursts up out of the floor under what it strikes, on its own rather than as a
 * stage of a run: a sanctuary, which lifts a piece off the floor rather than throwing it back.
 */
export function burstsFromBelow(preset: Lone): boolean {
  return !preset.isStaged && preset.effectKind === 'sanctuary';
}
