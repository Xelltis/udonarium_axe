import type { ParsedBuffModifierRequest } from '@axe/domain/character/buff-modifier';
import type { ResourceSlot } from '@axe/domain/data/resource-slot';

/** What an item takes written into it: words, numbers, or one of the choices it offers. */
export type ItemTakes =
  | { readonly takes: 'words' }
  | { readonly takes: 'numbers' }
  | { readonly takes: 'choice'; readonly choices: readonly string[] };

/**
 * How what is written reads: as an amount to hold the item at, as an amount to move it by, as words,
 * or as words whatever the item takes (`>`).
 */
export type WrittenAs = 'amount' | 'moveBy' | 'words' | 'wordsAnywhere';

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
  | { readonly kind: 'missing' };

/**
 * Where a value written to an item lands, which the chat's `:` commands, the `&!` buffs and the chat
 * lint all go by.
 *
 * An item that holds a choice takes only one of its choices, however the value is written, and only
 * as its value. One that holds words takes words, and an amount as a number. One that holds numbers
 * takes an amount, and words only as `>` writes them wherever it is told to. An item holding words or
 * a choice has no slot but its value. An amount to move an item by is no value written into it, so it
 * moves the number any item holds, a choice's too.
 */
export function landingOn(item: ItemTakes | null, slot: ResourceSlot, written: string, as: WrittenAs): ItemLanding {
  if (!item) return { kind: 'missing' };
  const words = written.trim();
  if (item.takes === 'numbers') {
    if (as === 'amount' || as === 'moveBy') return { kind: 'number' };
    return as === 'wordsAnywhere' ? { kind: 'words', words } : { kind: 'notWords' };
  }
  if (slot !== 'now' && as !== 'wordsAnywhere') return { kind: 'noSlot' };
  if (as === 'moveBy') return { kind: 'number' };
  if (item.takes === 'choice') {
    return item.choices.includes(words) ? { kind: 'words', words } : { kind: 'notAChoice', choices: item.choices };
  }
  return as === 'amount' ? { kind: 'number' } : { kind: 'words', words };
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
