import { clamp } from '@axe/core/util/clamp';
import { recordOf, storedRecordOf } from '@axe/core/util/stored-record';

/**
 * What a model does with the shapes it can be blended towards, by their names: the ones it blinks,
 * speaks and breathes with, each empty to take the model's own or `-` for none; the shapes it is
 * held in, as an expression, each by how far from 0 to 1; and the shapes it sways between as it
 * stands, which make a model with no motion of its own stand alive.
 */
export interface ModelFace {
  readonly blink: string;
  readonly mouth: string;
  readonly breath: string;
  readonly weights: Readonly<Record<string, number>>;
  readonly sways: readonly ShapeSway[];
}

/** A shape swayed towards and back as the model stands: how long one sway takes, and how far it goes, from 0 to 1. */
export interface ShapeSway {
  readonly name: string;
  readonly periodMs: number;
  readonly amount: number;
}

/** What a shape is used for without being asked for by name. */
export type ShapeUse = 'blink' | 'mouth' | 'breath';

/** The name that turns a use of shapes off. */
export const NO_SHAPE = '-';

/** How many shapes a model may be held in, and how many it may sway between. */
export const MAX_FACE_WEIGHTS = 64;
export const MAX_FACE_SWAYS = 16;

/** How short and how long one sway of a shape may take, in milliseconds. */
export const MIN_SWAY_MS = 200;
export const MAX_SWAY_MS = 60_000;

const MAX_SHAPE_NAME = 120;

/** A model that blinks, speaks and breathes with its own shapes, held in none and swaying between none. */
export const MODEL_FACE_AS_MADE: ModelFace = Object.freeze({
  blink: '',
  mouth: '',
  breath: '',
  weights: Object.freeze({}),
  sways: Object.freeze([]),
});

/** What a piece was stored doing with its model's shapes: the model's own where nothing was stored. */
export function modelFaceOf(value: unknown): ModelFace {
  const source = storedRecordOf(value);
  if (!source) return MODEL_FACE_AS_MADE;
  const weights: Record<string, number> = {};
  const stored = recordOf(source['weights']) ?? {};
  for (const key of Object.keys(stored).slice(0, MAX_FACE_WEIGHTS)) {
    const name = nameOf(key);
    const weight = stored[key];
    if (name && typeof weight === 'number' && Number.isFinite(weight) && weight > 0) {
      weights[name] = rounded(clamp(weight, 0, 1));
    }
  }
  const sways: ShapeSway[] = [];
  for (const raw of Array.isArray(source['sways']) ? source['sways'].slice(0, MAX_FACE_SWAYS) : []) {
    const sway = recordOf(raw);
    const name = nameOf(sway?.['name']);
    const periodMs = sway?.['periodMs'];
    const amount = sway?.['amount'];
    if (!name || typeof periodMs !== 'number' || !Number.isFinite(periodMs)) continue;
    sways.push({
      name,
      periodMs: Math.round(clamp(periodMs, MIN_SWAY_MS, MAX_SWAY_MS)),
      amount: typeof amount === 'number' && Number.isFinite(amount) ? rounded(clamp(amount, 0, 1)) : 1,
    });
  }
  return {
    blink: nameOf(source['blink']),
    mouth: nameOf(source['mouth']),
    breath: nameOf(source['breath']),
    weights,
    sways,
  };
}

/** What a piece does with its model's shapes as it is stored: only what differs from the model's own; empty for none. */
export function writeModelFace(face: ModelFace): string {
  const written: Record<string, unknown> = {};
  if (face.blink) written['blink'] = face.blink;
  if (face.mouth) written['mouth'] = face.mouth;
  if (face.breath) written['breath'] = face.breath;
  const weights: Record<string, number> = {};
  for (const name of Object.keys(face.weights).sort()) if (face.weights[name] > 0) weights[name] = face.weights[name];
  if (Object.keys(weights).length > 0) written['weights'] = weights;
  if (face.sways.length > 0)
    written['sways'] = face.sways.map(({ name, periodMs, amount }) => ({ name, periodMs, amount }));
  return Object.keys(written).length > 0 ? JSON.stringify(written) : '';
}

function nameOf(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_SHAPE_NAME) : '';
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}
