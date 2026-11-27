import { type ModelFace, modelFaceOf } from '@axe/domain/tabletop/model-face';
import { type ModelLook, modelLookOf, writeModelLook } from '@axe/domain/tabletop/model-look';
import { type ModelMotions, modelMotionsOf } from '@axe/domain/tabletop/model-motions';
import type { PieceModel } from '@axe/domain/tabletop/piece-model';

/** How many readings of each kind are kept, the readings of the models laid on a table and a few more. */
const KEPT_READINGS = 128;

/**
 * Reads text as a function reads it, keeping what it read of the texts last read, so that what is
 * drawn every frame does not read the same text again and again.
 */
function keptReading<T>(read: (text: string) => T): (text: string) => T {
  const kept = new Map<string, T>();
  return (text) => {
    const known = kept.get(text);
    if (known !== undefined) return known;
    const reading = read(text);
    if (kept.size >= KEPT_READINGS) kept.delete(kept.keys().next().value!);
    kept.set(text, reading);
    return reading;
  };
}

const lookOfText = keptReading(modelLookOf);
const lookKeyOfText = keptReading((text) => writeModelLook(modelLookOf(text)));
const motionsOfText = keptReading(modelMotionsOf);
const faceOfText = keptReading(modelFaceOf);

/** How a piece's model has its materials drawn, read from what the piece stores. */
export function lookOf(model: Pick<PieceModel, 'look'>): ModelLook {
  return lookOfText(model.look);
}

/** How a piece's model has its materials drawn, as two looks alike are written alike; empty for the model as made. */
export function lookKeyOf(model: Pick<PieceModel, 'look'>): string {
  return lookKeyOfText(model.look);
}

/** The motions a piece's model plays in a fight, read from what the piece stores. */
export function motionsOf(model: Pick<PieceModel, 'motions'>): ModelMotions {
  return motionsOfText(model.motions);
}

/** What a piece's model does with its shapes, read from what the piece stores. */
export function faceOf(model: Pick<PieceModel, 'face'>): ModelFace {
  return faceOfText(model.face);
}
