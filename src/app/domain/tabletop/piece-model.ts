/**
 * The 3D model a piece or a block can be drawn as, in place of its picture, on a table drawn on a
 * canvas: which model, how much larger or smaller than its footprint it is drawn, how far it is
 * turned from the way the piece faces, and the motions it plays standing still and walking.
 *
 * Every field is kept as text, empty for one never set: a peer that has never heard of models sends
 * none of them, and an empty size or turn is read as the model's own, never as nought.
 */
export interface PieceModelFields {
  modelIdentifier: unknown;
  modelScale: unknown;
  modelTurn: unknown;
  modelIdle: unknown;
  modelWalk: unknown;
}

/** A piece's model as it is drawn. */
export interface PieceModel {
  readonly identifier: string;
  /** How many times larger than the piece's footprint the model is drawn. */
  readonly scale: number;
  /** How far the model is turned from the way the piece faces, in degrees clockwise. */
  readonly turnDeg: number;
  /** The motion played standing still, or empty to take the model's own. */
  readonly idle: string;
  /** The motion played walking, or empty to take the model's own. */
  readonly walk: string;
}

/** How much smaller and larger than its footprint a model may be drawn. */
export const MIN_MODEL_SCALE = 0.1;
export const MAX_MODEL_SCALE = 10;

/** How many times larger than its footprint a model is drawn, as it was stored: the footprint itself where nothing was. */
export function modelScaleOf(value: unknown): number {
  if (value === null || value === undefined || value === '') return 1;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 1;
  return Math.min(MAX_MODEL_SCALE, Math.max(MIN_MODEL_SCALE, number));
}

/** How far a model is turned from the way the piece faces, as it was stored, from 0 up to 360 degrees. */
export function modelTurnOf(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return ((number % 360) + 360) % 360;
}

/** The model a piece is drawn as, or null where it is drawn as its picture. */
export function pieceModelOf(fields: PieceModelFields): PieceModel | null {
  const identifier = `${fields.modelIdentifier ?? ''}`.trim();
  if (!identifier) return null;
  return {
    identifier,
    scale: modelScaleOf(fields.modelScale),
    turnDeg: modelTurnOf(fields.modelTurn),
    idle: `${fields.modelIdle ?? ''}`.trim(),
    walk: `${fields.modelWalk ?? ''}`.trim(),
  };
}
