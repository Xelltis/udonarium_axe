import { toHalfWidth } from '@axe/core/util/string-util';
import type { ParsedBuffModifierRequest } from '@axe/domain/character/buff-modifier';
import type { ResourceSlot } from '@axe/domain/data/resource-slot';

/**
 * Whether what follows `=` is an amount to work out rather than words, for a chat command and a buff
 * alike: a number, a sum, a roll or a system's command, anything with a digit in it. Words with none,
 * as `炎`, `OK` or `L`, are words, and only they; words with a digit are written with `>`.
 */
export function isAmountWritten(amount: string): boolean {
  return /\d/.test(toHalfWidth(amount));
}

/**
 * What an item takes written into it: words, numbers, one of the choices it offers, or nothing, as a
 * check box or a picture takes nothing written.
 */
export type ItemTakes =
  | {
      readonly takes: 'words';
      /** Whether a number is read from what it holds now, which an amount set on it holds it at. */
      readonly holdsNumber: boolean;
    }
  | { readonly takes: 'numbers' }
  | { readonly takes: 'choice'; readonly choices: readonly string[] }
  | { readonly takes: 'nothing' };

/**
 * How what is written reads: as a worked-out amount to hold the item at, as a sum or a roll still to
 * be worked out, as an amount to move it by, as words, or as words whatever the item takes (`>`).
 */
export type WrittenAs = 'amount' | 'formula' | 'moveBy' | 'words' | 'wordsAnywhere';

/**
 * Where a value written to an item lands: as words into it, as a number moved or held, or nowhere, for
 * words that are none of a choice's, words into an item that holds numbers, a slot the item has not,
 * or an item that is not there.
 */
export type ItemLanding =
  | { readonly kind: 'words'; readonly words: string }
  | { readonly kind: 'number' }
  | { readonly kind: 'notAChoice'; readonly choices: readonly string[] }
  | { readonly kind: 'notWords' }
  | { readonly kind: 'noSlot' }
  | { readonly kind: 'unwritable' }
  | { readonly kind: 'missing' };

/**
 * Where a value written to an item lands, which the chat's `:` commands, the `&!` buffs and the chat
 * lint all go by.
 *
 * An item that holds a choice takes, as its value, only one of the choices it offers, a worked-out
 * amount as well as words. Words naming one of its choices are that choice however they read, `Lv2`
 * no sum to work out; any other sum or roll is worked out first and its answer held to the choices as
 * it is written. One that offers no choices takes anything, and `>` with nothing clears it. One that
 * holds words takes words, and an amount as a number where a number is read from what it holds, as
 * words where none is; a sum or a roll is worked out first. One that holds words but a number now, as a
 * line of text an older sheet keeps an ability's score in, takes words only as `>` writes them, so
 * no slip of a sum is written over the score. One that holds numbers takes an amount, and
 * words only as `>` writes them wherever it is told to. An item holding words or a choice has no slot
 * but its value. An amount to move an item by is no value written into it, so it moves the number any
 * item holds, a choice's too. A check box or a picture takes nothing written.
 */
export function landingOn(item: ItemTakes | null, slot: ResourceSlot, written: string, as: WrittenAs): ItemLanding {
  if (!item) return { kind: 'missing' };
  if (item.takes === 'nothing') return { kind: 'unwritable' };
  const words = written.trim();
  if (item.takes === 'numbers') {
    if (as === 'words') return { kind: 'notWords' };
    return as === 'wordsAnywhere' ? { kind: 'words', words } : { kind: 'number' };
  }
  if (slot !== 'now' && as !== 'wordsAnywhere') return { kind: 'noSlot' };
  if (as === 'moveBy') return { kind: 'number' };
  if (item.takes === 'choice') {
    if (item.choices.includes(words)) return { kind: 'words', words };
    if (as === 'formula') return { kind: 'number' };
    const free = item.choices.length < 1 || (as === 'wordsAnywhere' && words.length < 1);
    return free ? { kind: 'words', words } : { kind: 'notAChoice', choices: item.choices };
  }
  if (as === 'formula' || (as === 'amount' && item.holdsNumber)) return { kind: 'number' };
  if (as === 'words' && item.holdsNumber) return { kind: 'notWords' };
  return { kind: 'words', words };
}

/** What a sheet answers about its items, as far as where a value lands goes. */
export interface ItemsLandedOn {
  /**
   * The name an item is found by, as written or in half-width characters, of the two the one finding
   * an item a value can be written into first; null where neither finds one.
   */
  nameOf(reference: string): string | null;
  landingOf(name: string, slot: ResourceSlot, written: string, as: WrittenAs): ItemLanding;
  /** The number the slot of an item holds, or null where it holds none. */
  getValue(name: string, slot: ResourceSlot): number | null;
  /** Whether a buff may make an item of this name, there being none. */
  canMakeForBuff(name: string): boolean;
}

/**
 * A request naming its item by the name the sheet finds it by (see {@link ItemsLandedOn.nameOf}), so
 * one written with full-width letters is the item its half-width name finds, and records that name;
 * as written where neither finds one. The chat's lint, the report of laying a buff and laying it all
 * name the item here, so the three find the same one.
 */
export function namedRequest<T extends { readonly target: string }>(
  sheet: Pick<ItemsLandedOn, 'nameOf'>,
  request: T
): T {
  const named = sheet.nameOf(request.target);
  return named === null || named === request.target ? request : { ...request, target: named };
}

/**
 * What laying a `&!` request comes to on a piece: it moves a number or writes words (`lands`), an item
 * is made for it (`makes`), or it lands nowhere, for words none of a choice's, words into an item that
 * holds numbers, an item nothing is written into (a check box or a picture), a slot or an item with no
 * number to move, or an item the sheet has none of and none is made for. The chat's lint and the
 * report of laying the buff both go by it.
 */
export type BuffRequestOutcome =
  | { readonly kind: 'lands' }
  | { readonly kind: 'makes' }
  | { readonly kind: 'notAChoice'; readonly choices: readonly string[] }
  | { readonly kind: 'notWords' }
  | { readonly kind: 'unwritable' }
  | { readonly kind: 'noNumber' }
  | { readonly kind: 'missing' };

/**
 * What laying a `&!` request comes to on a sheet (see {@link BuffRequestOutcome}). An item the sheet
 * lacks is made only for a buff that is to make one, as one written in the chat is, that gives back
 * what it moves and moves the item's value, where a buff may make one by that name.
 */
export function buffRequestOutcome(
  sheet: ItemsLandedOn,
  request: Pick<ParsedBuffModifierRequest, 'target' | 'slot' | 'operator' | 'amount' | 'text' | 'lasting'>,
  makesMissing: boolean
): BuffRequestOutcome {
  const named = namedRequest(sheet, request);
  const landing = landingOfRequest(sheet, named);
  switch (landing.kind) {
    case 'words':
      return { kind: 'lands' };
    case 'number':
      return sheet.getValue(named.target, named.slot) == null ? { kind: 'noNumber' } : { kind: 'lands' };
    case 'noSlot':
      return { kind: 'noNumber' };
    case 'missing':
      return makesMissing && !named.lasting && named.slot === 'now' && sheet.canMakeForBuff(named.target)
        ? { kind: 'makes' }
        : { kind: 'missing' };
    default:
      return landing;
  }
}

/**
 * Where what a `&!` buff asks for lands on a sheet, on the item its name finds (see
 * {@link namedRequest}): its words as words, an amount it holds the item at as an amount written, and
 * one it moves the item by as a move.
 */
export function landingOfRequest(
  sheet: ItemsLandedOn,
  request: Pick<ParsedBuffModifierRequest, 'target' | 'slot' | 'operator' | 'amount' | 'text'>
): ItemLanding {
  const { target } = namedRequest(sheet, request);
  if (request.text !== undefined) return sheet.landingOf(target, request.slot, request.text, 'words');
  const as = request.operator === 'set' ? 'amount' : 'moveBy';
  return sheet.landingOf(target, request.slot, String(request.amount), as);
}
