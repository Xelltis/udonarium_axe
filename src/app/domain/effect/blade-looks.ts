import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { slashHits } from '@axe/domain/effect/timeline/blade';

/*
 * What the looks of a blade are told apart by where the way they strike matters to what they strike:
 * most cuts come from the side their caster stands and carry what they strike the way the blade
 * went, but a cleave comes from straight overhead.
 */

type Lone = Pick<EffectPreset, 'isStaged' | 'effectKind' | 'slashLook'>;

/**
 * Whether an effect brings a blade down from straight overhead, on its own rather than as a stage of
 * a run: a cleave, which presses what it strikes down rather than throwing it back from its caster.
 */
export function strikesFromOverhead(preset: Lone): boolean {
  return !preset.isStaged && preset.effectKind === 'slash' && preset.slashLook === 'heavy';
}

/** How much of the way on from its caster a piece is carried by a stroke, beside the way the blade went. */
const CARRIED_ON = 0.5;

/** The way a blow carries what it strikes over the floor: how far across its caster's sight, and how far on away from the caster; of length one. */
export interface CutCarry {
  readonly across: number;
  readonly away: number;
}

/**
 * The way each stroke of a cut carries what it strikes, in the order its blows land: the way its
 * blade went across the target, and a little on from its caster. Null for an effect that is no cut
 * on its own, and for a cleave and a drawing cut, whose blade does not cross the target from a side.
 */
export function cutCarriesOf(preset: Lone): readonly CutCarry[] | null {
  if (preset.isStaged || preset.effectKind !== 'slash') return null;
  if (preset.slashLook === 'heavy' || preset.slashLook === 'iai') return null;
  return slashHits(preset.slashLook).map((hit) => {
    const yaw = ((hit.yaw ?? 0) * Math.PI) / 180;
    const level = Math.cos((hit.angle * Math.PI) / 180);
    const across = Math.cos(yaw) * level;
    const away = -Math.sin(yaw) * level + CARRIED_ON;
    const size = Math.hypot(across, away) || 1;
    return { across: across / size, away: away / size };
  });
}
