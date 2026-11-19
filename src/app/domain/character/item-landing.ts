import type { ParsedBuffModifierRequest } from '@axe/domain/character/buff-modifier';
import type { ResourceSlot } from '@axe/domain/data/resource-slot';

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
 * words where none is; a sum or a roll is worked out first. One that holds numbers takes an amount, and
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
  return { kind: 'words', words };
}

/** What a sheet answers about its items, as far as where a value lands goes. */
export interface ItemsLandedOn {
  landingOf(name: string, slot: ResourceSlot, written: string, as: WrittenAs): ItemLanding;
}

/**
 * Where what a `&!` buff asks for lands on a sheet: its words as words, an amount it holds the item at
 * as an amount written, and one it moves the item by as a move.
 */
export function landingOfRequest(
  sheet: ItemsLandedOn,
  request: Pick<ParsedBuffModifierRequest, 'target' | 'slot' | 'operator' | 'amount' | 'text'>
): ItemLanding {
  if (request.text !== undefined) return sheet.landingOf(request.target, request.slot, request.text, 'words');
  const as = request.operator === 'set' ? 'amount' : 'moveBy';
  return sheet.landingOf(request.target, request.slot, String(request.amount), as);
}
