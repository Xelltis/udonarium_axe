import { toHalfWidth } from '@axe/core/util/string-util';
import type { ParsedBuffModifierRequest } from '@axe/domain/character/buff-modifier';
import type { DataElement } from '@axe/domain/data/data-element';
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

/**
 * An item a buff names, found once by its name as the request is laid, which every step of laying it
 * goes by after: the name it is recorded by, of the two the one finding an item a value can be written
 * into first (as written, or in half-width characters); the items the name stands for, the first read
 * and every one written, the room's aliases counted; what the first takes; and whether a buff made it
 * for itself and it is the buff's still.
 */
export interface BuffTarget {
  readonly name: string;
  readonly items: readonly DataElement[];
  readonly takes: ItemTakes;
  readonly made: boolean;
}

/** Whether buffs lay their layers on the item rather than move it (see `buff-layers`): it holds words or a choice. */
export function laysLayersOn(target: BuffTarget): boolean {
  return target.takes.takes === 'words' || target.takes.takes === 'choice';
}

/** What a sheet answers about its items, as far as where a value lands goes. */
export interface ItemsLandedOn {
  /** The item a name finds, found once (see {@link BuffTarget}); null where neither spelling finds one. */
  targetOf(reference: string): BuffTarget | null;
  /** The number a slot of the item holds, or null where it holds none. */
  valueOf(target: BuffTarget, slot: ResourceSlot): number | null;
  /** Whether a buff may make an item of this name, there being none. */
  canMakeForBuff(name: string): boolean;
}

/**
 * Where what a `&!` buff asks for lands (see {@link ItemLanding}), or nowhere for one that is to stay
 * once the buff goes, asked for by `:`, where it would be written in as a value, as words or one of a
 * choice's, which a buff puts back as it goes rather than leaving.
 */
export type RequestLanding = ItemLanding | { readonly kind: 'lastingWords' };

/**
 * What laying a `&!` request comes to on a piece: it moves a number or writes words (`lands`), an item
 * is made for it (`makes`), or it lands nowhere, for words none of a choice's, words into an item that
 * holds numbers, a value written in that `:` asks to leave, an item nothing is written into (a check
 * box or a picture), a slot or an item with no number to move, or an item the sheet has none of and
 * none is made for. The chat's lint and the report of laying the buff both go by it.
 */
export type BuffRequestOutcome =
  | { readonly kind: 'lands' }
  | { readonly kind: 'makes' }
  | { readonly kind: 'notAChoice'; readonly choices: readonly string[] }
  | { readonly kind: 'notWords' }
  | { readonly kind: 'lastingWords' }
  | { readonly kind: 'unwritable' }
  | { readonly kind: 'noNumber' }
  | { readonly kind: 'missing' };

/** What a request is asked as, for where it lands. */
type LaidRequest = Pick<ParsedBuffModifierRequest, 'slot' | 'operator' | 'amount' | 'text' | 'lasting'>;

/**
 * Where what a `&!` buff asks for lands on the item found for it (see {@link BuffTarget}): its words as
 * words, an amount it holds the item at as an amount written, and one it moves the item by as a move;
 * nowhere where one `:` asks to leave would be written in as a value (see {@link RequestLanding}).
 */
export function landingOfRequest(target: BuffTarget | null, request: LaidRequest): RequestLanding {
  const landing =
    request.text !== undefined
      ? landingOn(target?.takes ?? null, request.slot, request.text, 'words')
      : landingOn(
          target?.takes ?? null,
          request.slot,
          String(request.amount),
          request.operator === 'set' ? 'amount' : 'moveBy'
        );
  return request.lasting && landing.kind === 'words' ? { kind: 'lastingWords' } : landing;
}

/**
 * Whether a buff may make an item for a request the sheet has no item for: one that is to make one, as
 * one written in the chat is, that gives back what it moves and moves the item's value.
 */
export function makesItemFor(request: LaidRequest, makesMissing: boolean): boolean {
  return makesMissing && !request.lasting && request.slot === 'now';
}

/**
 * What a request lands as, told as what laying it comes to (see {@link BuffRequestOutcome}): `holdsNumber`
 * is whether the item holds a number to move, and `makes` whether an item would be made where there is
 * none. Laying a buff and the chat's lint both go by it.
 */
export function outcomeOfLanding(landing: RequestLanding, holdsNumber: boolean, makes: boolean): BuffRequestOutcome {
  switch (landing.kind) {
    case 'words':
      return { kind: 'lands' };
    case 'number':
      return holdsNumber ? { kind: 'lands' } : { kind: 'noNumber' };
    case 'noSlot':
      return { kind: 'noNumber' };
    case 'missing':
      return makes ? { kind: 'makes' } : { kind: 'missing' };
    default:
      return landing;
  }
}

/**
 * What laying a `&!` request comes to on a sheet (see {@link BuffRequestOutcome}), its item found once.
 * An item the sheet lacks is made only as {@link makesItemFor} says, where a buff may make one by that name.
 */
export function buffRequestOutcome(
  sheet: ItemsLandedOn,
  request: Pick<ParsedBuffModifierRequest, 'target'> & LaidRequest,
  makesMissing: boolean
): BuffRequestOutcome {
  const target = sheet.targetOf(request.target);
  const landing = landingOfRequest(target, request);
  return outcomeOfLanding(
    landing,
    target !== null && sheet.valueOf(target, request.slot) != null,
    makesItemFor(request, makesMissing) && sheet.canMakeForBuff(target?.name ?? request.target)
  );
}
