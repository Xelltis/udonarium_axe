import { storedRecordOf } from '@axe/core/util/stored-record';

/**
 * What a model plays a motion for: standing still, walking, striking a blow, working a spell or
 * loosing a shot, taking a blow, and going down.
 */
export type MotionRole = 'idle' | 'walk' | 'attack' | 'cast' | 'hit' | 'defeat';

/** The roles a model acts once and comes back from, or stays down after, rather than keeps playing. */
export type ActRole = Exclude<MotionRole, 'idle' | 'walk'>;

export const ACT_ROLES: readonly ActRole[] = ['attack', 'cast', 'hit', 'defeat'];

/**
 * The motions a piece asks its model for in a fight, each by name or empty to take the model's own,
 * and whether a model with no motion of its own for a role is moved by hand instead.
 */
export interface ModelMotions {
  readonly attack: string;
  readonly cast: string;
  readonly hit: string;
  readonly defeat: string;
  /** Whether a role the model has no motion for is played by moving the whole model, as a figure in the hand. */
  readonly made: boolean;
}

/** A model that names no motion and is moved by hand where it has none. */
export const MODEL_MOTIONS_AS_MADE: ModelMotions = Object.freeze({
  attack: '',
  cast: '',
  hit: '',
  defeat: '',
  made: true,
});

const MAX_MOTION_NAME = 120;

/** The motions a piece was stored asking for: the model's own where nothing was stored. */
export function modelMotionsOf(value: unknown): ModelMotions {
  const source = storedRecordOf(value);
  if (!source) return MODEL_MOTIONS_AS_MADE;
  return {
    attack: nameOf(source['attack']),
    cast: nameOf(source['cast']),
    hit: nameOf(source['hit']),
    defeat: nameOf(source['defeat']),
    made: source['made'] !== false,
  };
}

/** The motions a piece asks for as they are stored: only what differs from the model's own; empty for none. */
export function writeModelMotions(motions: ModelMotions): string {
  const written: Record<string, unknown> = {};
  for (const role of ACT_ROLES) if (motions[role]) written[role] = motions[role];
  if (!motions.made) written['made'] = false;
  return Object.keys(written).length > 0 ? JSON.stringify(written) : '';
}

function nameOf(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_MOTION_NAME) : '';
}

/**
 * Something a piece's model is asked to act: a role in a fight, or any motion of the model by name,
 * told apart from the act before by its key, so the same act asked for twice plays twice.
 */
export interface ModelAct {
  readonly key: string;
  /** The role acted, or `'named'` for a motion of the model asked for by name. */
  readonly role: ActRole | 'named';
  /** For a motion asked for by name, the name. */
  readonly name?: string;
  /**
   * When this screen came to know of the act, in the milliseconds its frames are timed in: the act
   * is played from there, so one known of long since, as the going down of a piece found already
   * down, is drawn as it ended.
   */
  readonly atMs: number;
  /**
   * Which way across the table the other in the act stands from the piece, of unit length, x to the
   * east and y to the south: the one struck for a blow, the one striking for a blow taken or for
   * going down. Left out where there is none, which acts the way the piece faces.
   */
  readonly toward?: { readonly x: number; readonly y: number };
}
