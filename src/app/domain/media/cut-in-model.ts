import { type ActRole, type ModelAct } from '@axe/domain/tabletop/model-motions';

/** What the model a cut-in shows does while it is shown: an act, once, or walking throughout. */
export interface CutInModelDoing {
  readonly act: ModelAct | null;
  readonly walking: boolean;
}

/** A model that only stands. */
export const CUT_IN_MODEL_STANDS: CutInModelDoing = Object.freeze({ act: null, walking: false });

/** What a cut-in's model may be set to do beside playing one of its own motions by name, as it is offered: stand first. */
export const CUT_IN_MODEL_ACTS = ['', 'walk', 'attack', 'cast', 'hit', 'defeat'] as const;

const ROLES: readonly string[] = ['attack', 'cast', 'hit', 'defeat'];

/**
 * What a cut-in's model does from the moment the cut-in is shown, by what the cut-in keeps for it:
 * nothing to stand, `walk` to walk for as long as it is shown, a role in a fight to act it once, or
 * else the model's own motion of that name. The act is due at that moment, on the clock frames are
 * timed by, and told apart from the last showing of the cut-in by it.
 */
export function cutInModelDoing(kept: string, cutInIdentifier: string, shownAtMs: number): CutInModelDoing {
  const asked = kept.trim();
  if (asked === '') return CUT_IN_MODEL_STANDS;
  if (asked === 'walk') return { act: null, walking: true };
  const key = `cut-in:${cutInIdentifier}:${shownAtMs}`;
  const act: ModelAct = ROLES.includes(asked)
    ? { key, role: asked as ActRole, atMs: shownAtMs }
    : { key, role: 'named', name: asked, atMs: shownAtMs };
  return { act, walking: false };
}
