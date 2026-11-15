import { buffGroupOf, isBuffGroupMember } from '@axe/domain/character/buff-group';
import { findStatusAilment, type StatusAilment } from '@axe/domain/character/status-ailment';
import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';

/** Which of the two a buff is: one that helps the piece wearing it, or one that hinders it. */
export type BuffKind = 'buff' | 'debuff';

/** The two kinds, in the order a choice between them is offered. */
export const BUFF_KINDS: readonly BuffKind[] = ['buff', 'debuff'];

const KIND_WORDS: Readonly<Record<string, BuffKind>> = {
  バフ: 'buff',
  buff: 'buff',
  デバフ: 'debuff',
  debuff: 'debuff',
};

/**
 * Reads a word written among a buff's look as the kind it marks the buff, `デバフ` or `debuff` and
 * `バフ` or `buff`, in either width and case; null for any other word.
 */
export function parseBuffKindWord(word: string): BuffKind | null {
  return KIND_WORDS[(word ?? '').trim().normalize('NFKC').toLowerCase()] ?? null;
}

/**
 * The kind a buff row is marked as, or null where it carries no mark. A missing mark, an empty one
 * and one that names neither kind all read as no mark.
 */
export function buffKindMarkOf(data: DataElement): BuffKind | null {
  const mark = data.getAttribute(DataElementAttribute.BUFF_KIND);
  return mark === 'buff' || mark === 'debuff' ? mark : null;
}

/** Marks a buff row as a kind, or takes its mark away where the kind is empty. */
export function writeBuffKindMark(data: DataElement, kind: BuffKind | ''): void {
  if (kind === '') data.removeAttribute(DataElementAttribute.BUFF_KIND);
  else data.setAttribute(DataElementAttribute.BUFF_KIND, kind);
}

/**
 * Whether a buff is a buff or a debuff, given the states the room keeps on hand.
 *
 * The mark on the buff says, where it has one. Without a mark, a buff going by the name of one of
 * the room's states is a debuff, and any other is a buff: neither its colour nor the way it moves a
 * status is read for a sign. A further row of a buff that moves several statuses is whatever the
 * first row of that buff is; where that row is gone it answers for itself, by the buff's name.
 */
export function buffKindOf(data: DataElement, ailments: readonly StatusAilment[]): BuffKind {
  const member = isBuffGroupMember(data);
  const name = member ? buffGroupOf(data) : data.name;
  const head = member ? headRowOf(data, name) : null;
  return buffKindFrom(buffKindMarkOf(head ?? data), name, ailments);
}

/**
 * Whether a buff of this name is a buff or a debuff, given the mark its first row carries, if any,
 * and the states the room keeps: the mark says where there is one, and without one a name among the
 * room's states is a debuff. This is {@link buffKindOf} for a buff already read off its rows.
 */
export function buffKindFrom(mark: BuffKind | null, name: string, ailments: readonly StatusAilment[]): BuffKind {
  if (mark) return mark;
  return findStatusAilment(ailments, name) ? 'debuff' : 'buff';
}

/**
 * The mark a buff laid from a form is to carry, given the kind picked on the form, or null where it
 * is to carry none. A form left untouched picks nothing and marks nothing, so the buff is whatever
 * its name makes it. A debuff picked is always marked. A buff picked is marked only where the name
 * is one of the room's states, which would otherwise make it a debuff; any other buff is laid with
 * no mark, as a plain command lays one.
 */
export function buffKindMarkPicked(
  picked: BuffKind | null,
  name: string,
  ailments: readonly StatusAilment[]
): BuffKind | null {
  if (picked === 'debuff') return 'debuff';
  if (picked === 'buff' && findStatusAilment(ailments, name)) return 'buff';
  return null;
}

/**
 * Marks a buff as a kind by hand, on its first row where the row given is a further row of a buff
 * that moves several statuses, since that row says what the whole buff is. The mark is always
 * written, a buff as much as a debuff, so a buff going by the name of one of the room's states
 * stays the kind it was made.
 */
export function markBuffKind(data: DataElement, kind: BuffKind): void {
  const head = isBuffGroupMember(data) ? headRowOf(data, buffGroupOf(data)) : null;
  writeBuffKindMark(head ?? data, kind);
}

/** The first row of the buff a further row belongs to, among the rows it is kept with. */
function headRowOf(data: DataElement, name: string): DataElement | null {
  const rows = (data.parent?.children ?? []) as DataElement[];
  return rows.find((row) => row !== data && row.name === name && !isBuffGroupMember(row)) ?? null;
}
