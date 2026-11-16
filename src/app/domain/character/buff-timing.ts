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

/**
 * When a buff moves its status again by what it moves at every count, where the buff says so itself:
 * at the end of the round, or as the turn of the piece carrying it starts or ends.
 */
export const BUFF_EFFECT_TIMINGS = ['roundEnd', 'turnStart', 'turnEnd'] as const;

export type BuffEffectTiming = (typeof BUFF_EFFECT_TIMINGS)[number];

const EFFECT_TIMING_MARK = /^(?:発生|tick)\s*[:：]\s*(.*)$/i;

/**
 * Whether a chat field is written as the moment a buff's effect moves at, `発生:手番終了` or
 * `tick:turnEnd`, whether or not the moment after the mark can be read.
 */
export function isBuffEffectTimingField(token: string): boolean {
  return EFFECT_TIMING_MARK.test((token ?? '').trim());
}

/**
 * Reads the moment a buff's effect moves at out of a chat field, written behind `発生:` or `tick:` in
 * any of the words a countdown's moment is written in. Null for a field without the mark, and for
 * one naming no moment an effect can move at, never among them.
 */
export function resolveBuffEffectTiming(token: string): BuffEffectTiming | null {
  const marked = EFFECT_TIMING_MARK.exec((token ?? '').trim());
  if (!marked) return null;
  const timing = resolveBuffTiming(marked[1]);
  return timing !== null && timing !== 'none' ? timing : null;
}

/**
 * The moment this buff's effect moves at, where the buff carries one of its own. Null where none is
 * written, as on every buff laid before there was one, and for an empty or unknown value: such a
 * buff moves its effect as it is counted down, or at the end of the round where it never is.
 */
export function buffEffectTimingOf(element: DataElement): BuffEffectTiming | null {
  const stored = (element.getAttribute(DataElementAttribute.BUFF_EFFECT_TIMING) ?? '').trim();
  return (BUFF_EFFECT_TIMINGS as readonly string[]).includes(stored) ? (stored as BuffEffectTiming) : null;
}

/** Writes the moment a buff's effect moves at, or takes it away for none. */
export function writeBuffEffectTiming(element: DataElement, timing: BuffEffectTiming | null | ''): void {
  if (timing) element.setAttribute(DataElementAttribute.BUFF_EFFECT_TIMING, timing);
  else element.removeAttribute(DataElementAttribute.BUFF_EFFECT_TIMING);
}

/**
 * Whether the clock moves this buff's effect now, apart from counting it down, for a turn belonging
 * to `acting`.
 *
 * A buff with a moment of its own moves at that moment alone, the turns being those of the piece
 * carrying it whatever trigger counts it down. One without moves as it is counted down, which is not
 * asked here, unless it is never counted down: then it moves at the end of every round.
 */
export function isBuffEffectDueAt(
  element: DataElement,
  timing: BuffTiming,
  owner: BuffTurnActor,
  acting: BuffTurnActor
): boolean {
  const own = buffEffectTimingOf(element);
  if (own === null) return timing === 'roundEnd' && !buffExpires(element);
  if (own !== timing) return false;
  return timing === 'roundEnd' || owner.identifier === acting.identifier;
}
