import { GameCharacter } from '@axe/domain/character/game-character';
import { Terrain } from '@axe/domain/tabletop/terrain';

/** The model a model library drag carries, by its identifier, as the page names the kind. */
export const MODEL_DRAG_TYPE = 'application/x-axe-model';

/** Whether something is drawn as a model where it is given one: a character or a block. */
function isDrawnAsModel(target: unknown): target is GameCharacter | Terrain {
  return target instanceof GameCharacter || target instanceof Terrain;
}

/** Whether something is a block locked in place, which keeps the look it has. */
function isLockedBlock(target: unknown): boolean {
  return target instanceof Terrain && target.isLocked;
}

/** Whether something can be given a model to be drawn as: a character, or a block not locked in place. */
export function takesModel(target: unknown): boolean {
  return isDrawnAsModel(target) && !isLockedBlock(target);
}

/**
 * Gives a character or a block not locked in place the model to be drawn as, and says whether it took
 * it: anything else takes no model. Its size, turn and motions are left as they were.
 */
export function attachModel(target: unknown, modelIdentifier: string): boolean {
  if (!isDrawnAsModel(target) || isLockedBlock(target)) return false;
  if (target.modelIdentifier !== modelIdentifier) target.modelIdentifier = modelIdentifier;
  return true;
}
