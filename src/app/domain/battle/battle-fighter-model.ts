import type { BattleFighterModel } from '@axe/domain/battle/battle-scene';
import { type PieceModel, type PieceModelFields, pieceModelOf } from '@axe/domain/tabletop/piece-model';

/** The model a piece is drawn as, written down for the stage; none for a piece that names no model. */
export function battleFighterModelOf(piece: Partial<PieceModelFields>): BattleFighterModel | null {
  const written = (value: unknown) => (value === null || value === undefined ? '' : `${value}`);
  const identifier = written(piece.modelIdentifier).trim();
  if (identifier.length < 1) return null;
  return {
    identifier,
    scale: written(piece.modelScale),
    turn: written(piece.modelTurn),
    idle: written(piece.modelIdle),
    walk: written(piece.modelWalk),
    look: written(piece.modelLook),
    motions: written(piece.modelMotions),
    face: written(piece.modelFace),
  };
}

/** A fighter's model as a piece's is read: its size, its turn, its motions, its look and its shapes. */
export function pieceModelOfFighter(model: BattleFighterModel | null | undefined): PieceModel | null {
  if (!model) return null;
  return pieceModelOf({
    modelIdentifier: model.identifier,
    modelScale: model.scale,
    modelTurn: model.turn,
    modelIdle: model.idle,
    modelWalk: model.walk,
    modelLook: model.look,
    modelMotions: model.motions,
    modelFace: model.face,
  });
}
