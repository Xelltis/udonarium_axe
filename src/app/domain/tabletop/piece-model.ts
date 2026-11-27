import { clamp } from '@axe/core/util/clamp';

/**
 * The 3D model a piece or a block can be drawn as, in place of its picture, on a table drawn on a
 * canvas: which model, how much larger or smaller than its footprint it is drawn, how far it is
 * turned from the way the piece faces, the motions it plays standing still and walking, how its
 * materials are drawn, the motions it plays in a fight, and what it does with its shapes.
 *
 * Every field is kept as text, empty for one never set: a peer that has never heard of models sends
 * none of them, and an empty size or turn is read as the model's own, never as nought. The last
 * three are each the text of a record, of what differs from the model as it was made alone; a peer
 * that has heard of models but not of them sends the first five alone.
 */
export interface PieceModelFields {
  modelIdentifier: unknown;
  modelScale: unknown;
  modelTurn: unknown;
  modelIdle: unknown;
  modelWalk: unknown;
  modelLook?: unknown;
  modelMotions?: unknown;
  modelFace?: unknown;
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
  /**
   * How its materials are drawn, the motions it plays in a fight and what it does with the shapes it
   * can be blended towards, each as the piece stores it: read by what draws the model (see
   * `piece-model-setup`), which is all that needs them, and empty for the model as it was made.
   */
  readonly look: string;
  readonly motions: string;
  readonly face: string;
}

/** What a model is drawn with where nothing was stored of its materials, its motions in a fight and its shapes. */
export const PIECE_MODEL_AS_MADE: Pick<PieceModel, 'look' | 'motions' | 'face'> = Object.freeze({
  look: '',
  motions: '',
  face: '',
});

/** How much smaller and larger than its footprint a model may be drawn. */
export const MIN_MODEL_SCALE = 0.1;
export const MAX_MODEL_SCALE = 10;

/** How many times larger than its footprint a model is drawn, as it was stored: the footprint itself where nothing was. */
export function modelScaleOf(value: unknown): number {
  if (value === null || value === undefined || value === '') return 1;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 1;
  return clamp(number, MIN_MODEL_SCALE, MAX_MODEL_SCALE);
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
    look: storedText(fields.modelLook),
    motions: storedText(fields.modelMotions),
    face: storedText(fields.modelFace),
  };
}

/**
 * As long as what a piece keeps of its model's look, its motions in a fight or its face may be carried
 * to another screen or taken from an AI: room for everything its sheet can write, as every material a
 * look may name set up in full.
 */
export const MAX_MODEL_SETUP_TEXT = 32_768;

/**
 * What a piece keeps of its model's setup as it is carried, whole, or nothing where it is longer than
 * may be: cut short, the record it is written as could not be read.
 */
export function carriedSetupText(value: unknown): string {
  return typeof value === 'string' && value.length <= MAX_MODEL_SETUP_TEXT ? value : '';
}

/** What a field stores, as text, empty for nothing stored. */
function storedText(value: unknown): string {
  return value === null || value === undefined ? '' : `${value}`.trim();
}
