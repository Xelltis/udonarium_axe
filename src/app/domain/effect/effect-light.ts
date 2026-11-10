/**
 * A light an effect throws over the table for a while: where it hangs, in table pixels (x to the
 * east, y to the south and z up), its colour, how strong it is, where 1 lights the board as a lamp
 * does, and how far it reaches, in table pixels. Hot things look hot because they light what is
 * round them: a burst lights the ground and the pieces near it for an instant, a fire for as long
 * as it burns.
 */
export interface EffectLight {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly color: string;
  readonly strength: number;
  readonly reachPx: number;
}

/** How many lights effects may throw over the table at once; the strongest are thrown. */
export const MAX_EFFECT_LIGHTS = 2;

/** The strongest lights of all those thrown at once, as many as may be thrown. */
export function strongestEffectLights(lights: readonly EffectLight[]): EffectLight[] {
  return [...lights].sort((a, b) => b.strength - a.strength).slice(0, MAX_EFFECT_LIGHTS);
}
