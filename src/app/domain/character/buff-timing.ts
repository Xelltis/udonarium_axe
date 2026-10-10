import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';

/**
 * When a buff's remaining rounds are counted down.
 *
 * `none` is never: a state that holds until somebody takes it away, which is what a status
 * ailment with no duration is. Nothing counts it down, by the clock or by hand.
 */
export const BUFF_TIMINGS = ['roundEnd', 'turnStart', 'turnEnd', 'none'] as const;

export type BuffTiming = (typeof BUFF_TIMINGS)[number];

export const DEFAULT_BUFF_TIMING: BuffTiming = 'roundEnd';

const TIMING_TOKENS: Record<string, BuffTiming> = {
  roundend: 'roundEnd',
  round: 'roundEnd',
  r: 'roundEnd',
  ラウンド終了時: 'roundEnd',
  ラウンド終了: 'roundEnd',
  ラウンド: 'roundEnd',
  turnstart: 'turnStart',
  start: 'turnStart',
  手番開始時: 'turnStart',
  手番開始: 'turnStart',
  開始: 'turnStart',
  turnend: 'turnEnd',
  end: 'turnEnd',
  手番終了時: 'turnEnd',
  手番終了: 'turnEnd',
  終了: 'turnEnd',
  none: 'none',
  なし: 'none',
  永続: 'none',
  解除まで: 'none',
  消えない: 'none',
};

/**
 * Reads a timing out of a chat token, written in English or Japanese and in any case. Null for a
 * token that names none.
 */
export function resolveBuffTiming(token: string): BuffTiming | null {
  const normalized = (token ?? '').trim();
  if (normalized.length < 1) return null;
  return TIMING_TOKENS[normalized] ?? TIMING_TOKENS[normalized.toLowerCase()] ?? null;
}

/** Whether a chat token names a moment a buff counts down at. */
export function isBuffTimingToken(token: string): boolean {
  return resolveBuffTiming(token) !== null;
}

/**
 * When this buff counts down, as stored on it. A missing or unknown value reads as the end of the
 * round.
 */
export function buffTimingOf(element: DataElement): BuffTiming {
  const stored = (element.getAttribute(DataElementAttribute.BUFF_TIMING) ?? '').trim();
  return (BUFF_TIMINGS as readonly string[]).includes(stored) ? (stored as BuffTiming) : DEFAULT_BUFF_TIMING;
}

/** Whether time takes this buff away at all. */
export function buffExpires(element: DataElement): boolean {
  return buffTimingOf(element) !== 'none';
}

/** Whoever a turn belongs to, matched by either half so a trigger can be written down as a name. */
export interface BuffTurnActor {
  identifier: string;
  name: string;
}

/**
 * Whose turn counts the buff down. Empty means the character carrying it, which is what a
 * buff cast on yourself wants; a spell that runs out on its caster's turn names them here.
 * The panel writes an identifier and a chat command writes a name, so both are read back.
 */
export function buffTriggerOf(element: DataElement): string {
  return (element.getAttribute(DataElementAttribute.BUFF_TRIGGER) ?? '').trim();
}

function isActor(token: string, actor: BuffTurnActor): boolean {
  return token === actor.identifier || token === actor.name;
}

/** Whether this buff counts down now, for a turn belonging to `acting`. */
export function isBuffDueAt(
  element: DataElement,
  timing: BuffTiming,
  owner: BuffTurnActor,
  acting: BuffTurnActor
): boolean {
  if (buffTimingOf(element) !== timing) return false;
  if (timing === 'roundEnd') return true;
  const trigger = buffTriggerOf(element);
  return trigger.length > 0 ? isActor(trigger, acting) : owner.identifier === acting.identifier;
}
