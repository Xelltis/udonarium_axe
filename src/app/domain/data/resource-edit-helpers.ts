import { toHalfWidth } from '@axe/core/util/string-util';
import { isAimedAtStatus } from '@axe/domain/character/aimed-at-buff';
import { parseBuffAppearance } from '@axe/domain/character/buff-appearance';
import {
  type BuffClearanceRule,
  type BuffRemovalRule,
  describeBuffRemoval,
  describeBuffsLacking,
  parseBuffClearanceCommand,
  removeBuffsWithParts,
} from '@axe/domain/character/buff-bulk-removal';
import {
  buffCommandKind,
  readBuffStacking,
  readCalculatedBuff,
  readCalculatedBuffLook,
  removedBuffName,
  splitBuffRounds,
} from '@axe/domain/character/buff-command';
import { BUFF_ITEMS_SECTION } from '@axe/domain/character/buff-made-items';
import {
  describeBuffModifier,
  describeBuffModifierTarget,
  holdsRequestedStatus,
  parseBuffModifierRequest,
  ParsedBuffModifierRequest,
  readBuffModifier,
} from '@axe/domain/character/buff-modifier';
import { BuffPileOn } from '@axe/domain/character/buff-stack';
import { buffExpires } from '@axe/domain/character/buff-timing';
import {
  type DefaultPick,
  type DefaultValueChange,
  type PieceDefaultReset,
  resetToDefaults,
} from '@axe/domain/character/default-value';
import { GameCharacter } from '@axe/domain/character/game-character';
import { saidNameOf } from '@axe/domain/character/hidden-name';
import {
  type BuffRequestOutcome,
  buffRequestOutcome,
  isAmountWritten,
  type ItemLanding,
} from '@axe/domain/character/item-landing';
import { isResourceSpentAt } from '@axe/domain/character/piece-gauge';
import { findStatusAilment, type StatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { plantStatusAilment, statusAilmentAsCommanded } from '@axe/domain/character/status-ailment-plant';
import { findReferencedElement } from '@axe/domain/data/element-reference';
import { findEmbeddedRolls, replaceEmbeddedRolls } from '@axe/domain/data/embedded-roll';
import { resourceCommandParts } from '@axe/domain/data/resource-command-words';
import { readNamedResourceSlot, type ResourceSlot, resourceSlotLabel } from '@axe/domain/data/resource-slot';
import { isKeptFromAnyone } from '@axe/domain/disclosure/disclosure';

export interface ResourceEditOption {
  limitMinMax: boolean;
  zeroLimit: boolean;
  isErr: boolean;
}

export interface ResourceEdit {
  target: string;
  operator: string;
  diceResult: string;
  command: string;
  /** The amount as written after the operator, options taken off, before it is made into a command. */
  amount: string;
  replace: string;
  isDiceRoll: boolean;
  embeddedRolls: string[];
  calcAns: number;
  nowOrMax: ResourceSlot;
  option: ResourceEditOption | null;
  object: GameCharacter | null;
  targeted: boolean;
}

export interface BuffEdit {
  command: string;
  object: GameCharacter;
  targeted: boolean;
}

/**
 * Reads the option letters at the end of a resource command's amount.
 *
 * `L` keeps the result between 0 and the maximum, and `Z` stops a change from going the wrong way, so adding
 * a negative or taking away a positive leaves the value alone. Any other trailing letter apart from `D`,
 * which belongs to a dice roll, marks the options as unreadable.
 */
export function parseResourceEditOption(text: string): ResourceEditOption {
  const ans: ResourceEditOption = {
    limitMinMax: false,
    zeroLimit: false,
    isErr: false,
  };

  let option = splitOptionLetters(toHalfWidth(text)).options;
  if (option === '') return ans;
  if (option.match(/L/i)) {
    option = option.replace(/L/i, '');
    ans.limitMinMax = true;
  }

  if (option.match(/Z/i)) {
    option = option.replace(/Z/i, '');
    ans.zeroLimit = true;
  }

  if (option.length !== 0) {
    ans.isErr = true;
  }
  return ans;
}

/**
 * The letters at the end of an amount that are options rather than part of it. A division's
 * rounding, `C`, `R`, `F` or `U` straight after its divisor, belongs to the amount, so `12/2CL`
 * rounds up and keeps the result within its limits.
 */
function splitOptionLetters(text: string): { amount: string; options: string } {
  const mat = text.match(/([A-CE-Z]+)$/i);
  if (!mat) return { amount: text, options: '' };
  let amount = text.slice(0, mat.index);
  let options = mat[1];
  if (/\/\s*(?:\d+|\([^()]*\))\s*$/.test(amount) && /^[CRFU]/i.test(options)) {
    amount += options[0];
    options = options.slice(1);
  }
  return { amount, options };
}

/**
 * The amount with its first term in parentheses where that term divides, so the minus a taking-away
 * puts in front of it comes after the division and its rounding: `13/2F` taken away takes 6, where
 * `-13/2F` would round -6.5 down to -7. A division inside a bracketed command is already a whole
 * number by then, and leaves the term as it is.
 */
function wrapLeadingDivision(amount: string): string {
  let depth = 0;
  let end = amount.length;
  for (let index = 0; index < amount.length; index++) {
    const char = amount[index];
    if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (index > 0 && depth === 0 && (char === '+' || char === '-')) {
      end = index;
      break;
    }
  }
  const first = amount.slice(0, end);
  const divides = replaceEmbeddedRolls(
    first,
    findEmbeddedRolls(first).map(() => 0)
  ).includes('/');
  return divides ? `(${first})${amount.slice(end)}` : amount;
}

/** A blank edit aimed at a resource's current value, to be filled in by {@link convertCommandToResourceEdit}. */
export function createDefaultResourceEdit(): ResourceEdit {
  return {
    target: '',
    operator: '',
    diceResult: '',
    command: '',
    amount: '',
    replace: '',
    isDiceRoll: false,
    embeddedRolls: [],
    calcAns: 0,
    nowOrMax: 'now',
    option: null,
    object: null,
    targeted: false,
  };
}

/**
 * Fills in an edit from one chat resource command such as `:HP-2d6`, `:MP=10` or `:メモ>text`.
 *
 * Records the character, the status and slot named, and the operator. For arithmetic it also builds the dice
 * command that works out the amount and reads the option letters; `>` only records the replacement text.
 * Returns false, leaving the edit partly filled, when the text is not a command, the character has no
 * status by that name, or the options cannot be read.
 */
export function convertCommandToResourceEdit(
  oneResourceEdit: ResourceEdit,
  text: string,
  object: GameCharacter,
  targeted: boolean
): boolean {
  oneResourceEdit.object = object;
  oneResourceEdit.targeted = targeted;

  const parts = resourceCommandParts(text);
  if (!parts) return false;
  if (parts.operator !== '>' && parts.amount === '') return false;

  const named = readNamedResourceSlot(parts.name);
  oneResourceEdit.nowOrMax = named.slot;

  oneResourceEdit.operator = parts.operator;

  const target = statusNamedIn(object, named.name);
  if (target === null) return false;
  oneResourceEdit.target = target;

  if (oneResourceEdit.operator === '>') {
    oneResourceEdit.replace = parts.amount;
    return true;
  }
  const landing = commandLanding(object, target, named.slot, parts.operator, parts.amount);
  if (!readsOptions(landing)) {
    oneResourceEdit.operator = '>';
    oneResourceEdit.replace = landing.kind === 'words' ? landing.words : parts.amount;
    return true;
  }

  const reg3 = splitOptionLetters(toHalfWidth(parts.amount)).amount;
  const commandPrefix = oneResourceEdit.operator === '-' ? '-' : '';
  oneResourceEdit.amount = reg3;
  const leading = commandPrefix === '-' ? wrapLeadingDivision(oneResourceEdit.amount) : oneResourceEdit.amount;
  oneResourceEdit.command = `${commandPrefix}${leading}+(1d1-1)`;

  const optionCommand = parseResourceEditOption(parts.amount);
  if (optionCommand.isErr) {
    return false;
  }
  oneResourceEdit.option = optionCommand;
  oneResourceEdit.isDiceRoll = !!toHalfWidth(reg3).match(/\d[dD]/);

  return true;
}

/**
 * The status a `:` command names, as the character's sheet has it: the name as written, or else in
 * half-width characters. Null where the sheet has neither, or nothing can be written into it.
 */
export function statusNamedIn(object: GameCharacter, name: string): string | null {
  const named = object.status.nameOf(name);
  return named !== null && object.status.canChangeName(named) ? named : null;
}

/**
 * The slot of a status a `:` command reaches: the one it names, but the value itself for the maximum
 * of a status that has none, as a line of text has none.
 */
export function slotWrittenTo(object: GameCharacter, target: string, slot: ResourceSlot): ResourceSlot {
  return slot === 'max' && object.status.getValue(target, 'max') == null ? 'now' : slot;
}

/**
 * Whether a `:` command's value is worked out as an amount where it lands, reading the option letters
 * at its end: everywhere but where it is written as words, or turned away from a choice.
 */
export function readsOptions(landing: ItemLanding): boolean {
  return landing.kind !== 'words' && landing.kind !== 'notAChoice';
}

/**
 * Where a `:` command's value lands on the status it names (see {@link landingOn}), in the slot it
 * reaches (see {@link slotWrittenTo}): `>` writes words wherever it is told to, `=` writes words into
 * an item that takes words or a choice and works an amount out to hold the item at, a plain number
 * being one worked out already, held to a choice's choices as it is, and the other operators move
 * the number by it.
 */
export function commandLanding(
  object: GameCharacter,
  target: string,
  slot: ResourceSlot,
  operator: string,
  amount: string
): ItemLanding {
  if (operator === '>') return object.status.landingOf(target, 'now', amount, 'wordsAnywhere');
  const reached = slotWrittenTo(object, target, slot);
  if (operator !== '=') return object.status.landingOf(target, reached, amount, 'moveBy');
  if (!isAmountWritten(amount)) return object.status.landingOf(target, reached, amount, 'words');
  const plain = toHalfWidth(amount).trim();
  return Number.isFinite(Number(plain))
    ? object.status.landingOf(target, reached, plain, 'amount')
    : object.status.landingOf(target, reached, amount, 'formula');
}

/**
 * Writes a `>` command's text into the character's status, or a `=` one's words, and returns the chat
 * text reporting it (see {@link wordsReport}). An item holding a choice takes only one of its choices;
 * anything else is left as it was and the report names the choices.
 */
export function applyTextEdit(edit: ResourceEdit, character: GameCharacter): ResourceEditReport {
  const landing = character.status.landingOf(edit.target, 'now', edit.replace, 'wordsAnywhere');
  if (landing.kind === 'notAChoice') {
    return wordsReport(character, edit.target, notAChoiceText(edit.target, edit.replace, landing.choices));
  }
  character.status.setText(edit.target, edit.replace);
  return wordsReport(character, edit.target, `${edit.target}＞${edit.replace}`);
}

/**
 * The report of words written into a status, or turned away from a choice: in full, and as it is said
 * to everyone, which of a piece whose contents are kept from anyone is only that the status was written
 * into, as only the change is said of a value set on one: what it holds, a roll's answer, and the
 * choices it offers stay with those who may see them.
 */
function wordsReport(character: GameCharacter, target: string, full: string): ResourceEditReport {
  return keptReport(character, `${full}    `, `${target}＞${KEPT_VALUE}    `);
}

/**
 * A report of a change to one piece: in full, and as it is said to everyone, which is `kept` for a
 * piece whose contents are kept from anyone, and the full report for any other. Every report of a
 * change to one piece's items, by a `:` command or a `&!` buff, goes through here.
 */
function keptReport(character: GameCharacter, full: string, kept: string): ResourceEditReport {
  return { full, shown: isKeptFromAnyone(character) ? kept : full };
}

/** A report said to everyone as it is. */
function sayToAll(text: string): ResourceEditReport {
  return { full: text, shown: text };
}

/** What a report says of words that are none of the choices an item offers, naming the choices where there are any to say. */
function notAChoiceText(target: string, words: string, choices: readonly string[]): string {
  const offered = choices.length > 0 ? `: ${choices.join('・')}` : '';
  return `${target}に「${words.trim()}」はありません${offered}`;
}

/**
 * Applies a worked-out resource change to the character and returns the chat text reporting old and new
 * values; see {@link applyResourceEditReport}.
 */
export function applyResourceEdit(edit: ResourceEdit, character: GameCharacter): string {
  return applyResourceEditReport(edit, character).full;
}

/** The chat text reporting a resource change: in full, and as it is said to everyone. */
export interface ResourceEditReport {
  readonly full: string;
  readonly shown: string;
}

/**
 * Applies a worked-out resource change to the character and returns the chat text reporting old and new
 * values, and the text said to everyone, which is the same but for a piece whose contents are kept from
 * anyone: of that, only the change is said, until its current value runs out, down to nothing or for a
 * resource counting up to its end at its maximum, and it is beaten.
 *
 * The text notes when an option or the stored bounds held the value back, and when changing a base or
 * correction moved the effective bounds or the current maximum. An edit of the maximum on a status without
 * one changes the current value instead. Both texts are empty when the status has no value to change.
 */
export function applyResourceEditReport(edit: ResourceEdit, character: GameCharacter): ResourceEditReport {
  const nowOrMax = slotWrittenTo(character, edit.target, edit.nowOrMax);
  if (edit.operator === '=') {
    const answer = String(edit.calcAns);
    const landing = character.status.landingOf(edit.target, nowOrMax, answer, 'amount');
    if (landing.kind === 'notAChoice') {
      return wordsReport(character, edit.target, notAChoiceText(edit.target, answer, landing.choices));
    }
    if (landing.kind === 'words') {
      character.status.setText(edit.target, landing.words);
      return wordsReport(character, edit.target, `${edit.target}＞${landing.words}`);
    }
  }
  let optionText = '';
  const maxNum = character.status.getValue(edit.target, 'max');

  const oldNum = character.status.getValue(edit.target, nowOrMax);
  if (oldNum == null) return { full: '', shown: '' };

  // Snapshot effective bounds BEFORE applying so we can report shifts when corrections move them.
  const targetElement = character.detailDataElement
    ? findReferencedElement(character.detailDataElement, edit.target)
    : null;
  const oldEffectiveMax = targetElement?.effectiveMax ?? null;
  const oldEffectiveMin = targetElement?.effectiveMin ?? null;

  let newNum: number;
  if (edit.operator === '=') {
    newNum = edit.calcAns;
  } else {
    const zeroLimit = edit.option!.zeroLimit;
    if (zeroLimit && edit.operator === '+' && edit.calcAns < 0) {
      newNum = oldNum + 0;
      optionText = '(0制限)';
    } else if (zeroLimit && edit.operator === '-' && edit.calcAns > 0) {
      newNum = oldNum + 0;
      optionText = '(0制限)';
    } else {
      newNum = oldNum + edit.calcAns;
    }
  }

  if (edit.option!.limitMinMax && maxNum != null && (nowOrMax === 'now' || nowOrMax === 'max')) {
    if (newNum > maxNum && nowOrMax === 'now') {
      newNum = maxNum;
      optionText = '(最大)';
    }
    if (newNum < 0) {
      newNum = 0;
      optionText = '(最小)';
    }
  }

  character.status.setValue(edit.target, nowOrMax, newNum);

  // setValue clamps via data-min / data-max attributes; reflect the stored value in the chat log.
  const storedNum = character.status.getValue(edit.target, nowOrMax);
  if (storedNum != null && storedNum !== newNum) {
    optionText = storedNum < newNum ? '(最大)' : '(最小)';
    newNum = storedNum;
  }

  // Base / correction edits: report secondary changes to the effective bounds and to value.
  let sideEffectText = '';
  const isMaxSideEdit = nowOrMax === 'maxBase' || nowOrMax === 'maxCorrection';
  const isMinSideEdit = nowOrMax === 'minBase' || nowOrMax === 'minCorrection';
  if (isMaxSideEdit || isMinSideEdit) {
    const newEffectiveMax = targetElement?.effectiveMax ?? null;
    const newEffectiveMin = targetElement?.effectiveMin ?? null;
    if (isMaxSideEdit && oldEffectiveMax !== newEffectiveMax) {
      sideEffectText += ` [有効最大:${oldEffectiveMax ?? '-'}→${newEffectiveMax ?? '-'}]`;
    }
    if (isMinSideEdit && oldEffectiveMin !== newEffectiveMin) {
      sideEffectText += ` [有効最小:${oldEffectiveMin ?? '-'}→${newEffectiveMin ?? '-'}]`;
    }
    const storedCurrentMax = character.status.getValue(edit.target, 'max');
    if (storedCurrentMax != null && Number(targetElement?.value) !== storedCurrentMax) {
      sideEffectText += ` [現在最大値→${storedCurrentMax}]`;
    }
  }

  const operatorText = edit.operator === '-' ? '' : edit.operator;
  const label = resourceSlotLabel(nowOrMax);
  const suffix = label.length > 0 ? `(${label})` : '';
  const full = `${edit.target}${suffix}:${oldNum}${operatorText}${edit.diceResult}＞${newNum}${optionText}${sideEffectText}    `;
  const beaten =
    nowOrMax === 'now' && isResourceSpentAt(targetElement, newNum, character.status.getValue(edit.target, 'max'));
  if (beaten) return sayToAll(full);
  const change = edit.operator === '=' ? `=${KEPT_VALUE}` : `${operatorText}${edit.diceResult}`;
  return keptReport(character, full, `${edit.target}${suffix}:${change}    `);
}

/** What stands in for a value said to be set on a piece whose contents are kept from anyone. */
const KEPT_VALUE = '？';

/** One `:` command that puts a piece's values back to their defaults, ready to be carried out. */
export interface DefaultResetEdit {
  object: GameCharacter;
  targeted: boolean;
  pick: DefaultPick;
}

/** The chat text reporting values put back, the pieces whose contents it keeps from anyone, and what changed. */
export interface DefaultResetReport extends ResourceEditReport {
  readonly kept: readonly GameCharacter[];
  readonly resets: readonly PieceDefaultReset[];
}

function describeDefaultChange(change: DefaultValueChange): string {
  const label = resourceSlotLabel(change.slot);
  const shown = (value: number | string) => (`${value}` === '' ? '-' : `${value}`);
  return `${change.name}${label.length > 0 ? `(${label})` : ''}:${shown(change.before)}→${shown(change.after)}`;
}

/**
 * Puts a piece and the parts that go with it back to their defaults and returns the chat text
 * reporting it; see {@link resetToDefaults}.
 *
 * Each item that changed is told with what it held before and after, the items of a part after the
 * part's name. Of a piece whose contents are kept from anyone, everyone is told only how many items
 * changed. The text says so where every item already stood at its default, and where nothing asked
 * for keeps one. Both texts are empty where one item was named and the piece has none by that name.
 */
export function applyDefaultReset(edit: DefaultResetEdit): DefaultResetReport {
  const resets = resetToDefaults(edit.object, edit.pick);
  const named = edit.pick.kind === 'item' ? edit.pick : null;
  const label = named ? `${named.name}${slotSuffix(named.slot)}` : '';
  const said = (text: string): DefaultResetReport => ({ full: text, shown: text, kept: [], resets });

  if (!resets.some((reset) => reset.found)) return said('');
  if (resets.every((reset) => reset.defaults < 1)) {
    return said(named ? `${label}に既定値はありません    ` : '既定値のある項目はありません    ');
  }
  const changed = resets.filter((reset) => reset.changes.length > 0);
  if (changed.length < 1) return said(named ? `${label}は既定値のままです    ` : '既定値のままです    ');

  let full = '既定値に戻す';
  let shown = '既定値に戻す';
  const kept: GameCharacter[] = [];
  for (const reset of changed) {
    const part = reset.piece === edit.object ? '' : ` 部位「${saidNameOf(reset.piece)}」`;
    const items = `${part} ${reset.changes.map(describeDefaultChange).join(' ')}`;
    full += items;
    if (isKeptFromAnyone(reset.piece)) {
      kept.push(reset.piece);
      shown += `${part}（${reset.changes.length}項目）`;
    } else shown += items;
  }
  return { full: `${full}    `, shown: `${shown}    `, kept, resets };
}

function slotSuffix(slot: ResourceSlot): string {
  const label = resourceSlotLabel(slot);
  return label.length > 0 ? `(${label})` : '';
}

/**
 * `&!name/status/op/amount/R/timing/trigger` - a buff that moves a status as it goes on and
 * moves it back as it runs out, so the table stops doing the arithmetic by hand.
 *
 * `&!name/status+amount,status-amount/R/timing/trigger` moves several at once, written together in
 * the second field; it is told from the first by its third field, which is no operator. Each status
 * gets a row of its own, the first under the buff's name and the rest under the name and their
 * status, all of them marked as the one buff, so that a version that knows no such buff shows them
 * as buffs of their own that each put back what they moved.
 *
 * A field `発生:手番終了` (`tick:turnEnd`) after the rounds gives the effect a moment of its own to move
 * at, in place of moving as the buff is counted down.
 *
 * `&+!` stacks: a second helping moves the status again and the buff remembers both, rather than
 * putting the first one back, and `&++!` lengthens the buff by the rounds asked for as well.
 * Holding a status at a value (`=`) is the one thing that cannot stack, since holding it there
 * twice is still holding it there, so that starts over as always. For the same reason a helping
 * stacked on a buff that holds its status leaves the status held, adding only to the rounds.
 */
function applyCalculatedBuff(command: string, character: GameCharacter, piles: BuffPileOn): ResourceEditReport {
  const { name, requests, rest } = readCalculatedBuff(command);
  if (name.length < 1) return sayToAll('');
  if (!requests) return sayToAll(`バフの書式が読めません ${name}    `);
  return grantCalculatedBuff(character, name, requests, rest, piles);
}

/**
 * Lays a buff of one row a status, or stacks it, and says in the chat what it did. A single status
 * stacked on a buff of several leaves the buff marked as several; laid anew, it is one again. Taking
 * the buff off and laying it again is one change to the piece's buffs, so an item it made and stands
 * on again is kept.
 */
function grantCalculatedBuff(
  character: GameCharacter,
  name: string,
  requests: readonly ParsedBuffModifierRequest[],
  rest: readonly string[],
  piles: BuffPileOn
): ResourceEditReport {
  return character.buffs.alter(() => {
    const { rounds, look } = splitBuffRounds(rest);
    const roundText = (rounds ?? '').trim();
    const round = roundText.length > 0 && Number.isFinite(Number(roundText)) ? Number(roundText) : 3;
    const stacking =
      piles !== 'none' && requests.every((request) => request.operator === 'add') && character.buffs.find(name) != null;
    if (!stacking) character.buffs.removeGroupMembers(name);
    const grouped = requests.length > 1;
    const group = grouped ? name : stacking ? undefined : '';
    const written = readCalculatedBuffLook(look);
    // Laid anew, a buff written without a moment for its effect has none, whatever one of its name had.
    const appearance = { ...written, effectTiming: written.effectTiming ?? (stacking ? undefined : ''), group };

    const missing: string[] = [];
    const made: string[] = [];
    const refused: string[] = [];
    const effects: string[] = [];
    requests.forEach((request, index) => {
      const rowName = index === 0 ? name : `${name}（${describeBuffModifierTarget(request)}）`;
      const effect = describeBuffModifier(request);
      const standing = stacking ? character.buffs.find(rowName) : null;
      const rowStacking = standing != null;
      const note = standing && holdsRequestedStatus(readBuffModifier(standing), request) ? '' : effect;
      if (!rowStacking) character.buffs.addRound(rowName, effect, round, appearance);
      else if (piles === 'extend') character.buffs.extendRound(rowName, note, round, appearance);
      else character.buffs.stackRound(rowName, note, round, appearance);

      const data = character.buffs.find(rowName);
      if (!data) return;
      // A status moved for whoever aims at the piece is the note's to tell, not the piece's to move.
      if (!isAimedAtStatus(request.target)) {
        const outcome = buffRequestOutcome(character.status, request, true);
        const applied = rowStacking
          ? character.buffs.stackModifier(data, request, true)
          : character.buffs.applyModifier(data, request, true);
        if (applied) {
          if (outcome.kind === 'makes') made.push(request.target);
        } else {
          const said = refusalOf(outcome, request);
          if (said) refused.push(said);
          else missing.push(request.target);
        }
      }
      effects.push(rowStacking ? `${data.currentValue ?? effect}` : effect);
    });

    const data = character.buffs.find(name);
    if (!data) return sayToAll('');
    const verb = stacking ? '加算' : '付与';
    const lack =
      (missing.length > 0 ? ` (${missing.join('・')}が見つかりません)` : '') +
      (made.length > 0 ? ` (${made.join('・')}を${BUFF_ITEMS_SECTION}に作りました)` : '') +
      refused.map((said) => ` (${said})`).join('');
    const left = buffExpires(data) ? `/${data.value}R` : '';
    const laid = `${name}を${verb} ${effects.join(',')}${left}`;
    return keptReport(character, `${laid}${lack}    `, `${laid}    `);
  });
}

/**
 * What the report of laying a `&!` buff says of a request it laid nowhere (see
 * {@link buffRequestOutcome}), as the chat's lint says it; null for an item the sheet lacks, which the
 * report names among those not found.
 */
function refusalOf(outcome: BuffRequestOutcome, request: ParsedBuffModifierRequest): string | null {
  switch (outcome.kind) {
    case 'notAChoice':
      return notAChoiceText(request.target, request.text ?? String(request.amount), outcome.choices);
    case 'notWords':
      return `${request.target}は数の項目なので「${request.text}」は書けません`;
    case 'lastingWords':
      return `${request.target}に書く値はバフが外れると戻るため、「:」では残せません`;
    case 'unwritable':
      return `${request.target}には書けません`;
    case 'noNumber':
      return `${request.target}に動かす数がありません`;
    default:
      return null;
  }
}

/** Runs one `&` buff command on the character and returns the chat text reporting it in full; see {@link applyBuffEditReport}. */
export function applyBuffEdit(buff: BuffEdit, character: GameCharacter): string {
  return applyBuffEditReport(buff, character).full;
}

/**
 * Runs one `&` buff command on the character and returns the chat text reporting it: in full, and as
 * it is said to everyone, which of a piece whose contents are kept from anyone leaves out what a `&!`
 * buff found of its items (see {@link keptReport}).
 *
 * `&R-` and `&R+` move every buff's remaining rounds, `&D` clears buffs at zero rounds or fewer, `&name-`
 * removes one buff, `&*-`, `&*バフ-` and `&*デバフ-` clear the piece and its parts of every buff, of
 * the buffs or of the debuffs, `&!` adds a buff that changes a status, and anything else adds a plain
 * `name/effect/rounds/appearance` buff; one named after a state the room keeps puts that state on,
 * what the command leaves out read from the room's list of states. A `+` right after the ampersand
 * stacks onto a buff of the same name rather than starting it over, and `++` lengthens it by the
 * rounds asked for as well. A targeted command's text starts with the character's name.
 */
export function applyBuffEditReport(buff: BuffEdit, character: GameCharacter): ResourceEditReport {
  const { piles, command } = readBuffStacking(buff.command);
  let text = '';
  if (buff.targeted) {
    text += `[${saidNameOf(character)}] `;
  }

  const kind = buffCommandKind(command);
  const clearance = parseBuffClearanceCommand(command);
  if (kind === 'roundsDown') {
    character.buffs.decreaseRound();
    text += 'バフRを減少    ';
  } else if (kind === 'roundsUp') {
    character.buffs.increaseRound();
    text += 'バフRを増加    ';
  } else if (kind === 'clearZero') {
    character.buffs.deleteZeroRound();
    text += '0R以下のバフを消去    ';
  } else if (clearance) {
    text += clearBuffs(character, clearance);
  } else if (kind === 'remove') {
    const reg1 = removedBuffName(command);
    if (character.buffs.delete(reg1)) {
      text += `${reg1}を消去    `;
    }
  } else if (kind === 'calculated') {
    const report = applyCalculatedBuff(command, character, piles);
    return { full: text + report.full, shown: text + report.shown };
  } else {
    const splittext = readModifierLayout(command.replace(/^[tTｔＴ]?&/i, '').split('/'));
    const state = findStatusAilment(StatusAilmentCatalog.instance.ailments, splittext[0]);
    if (state && (piles === 'none' || !character.buffs.find(state.name))) {
      return sayToAll(text + plantCommandedState(state, splittext, character));
    }
    let round: number | undefined = undefined;
    let sub = '';
    const buffname = splittext[0];
    let bufftext = splittext[0];

    if (splittext.length > 1) {
      sub = splittext[1];
      bufftext = `${bufftext}/${splittext[1]}`;
    }
    const { rounds, look } = splitBuffRounds(splittext.slice(2));
    if (rounds !== undefined) {
      if (rounds) {
        round = parseInt(rounds);
        if (Number.isNaN(round)) {
          round = 3;
        }
      } else {
        round = 3;
      }
    }

    const appearance = parseBuffAppearance(look);
    const lookText = look
      .filter((token) => token)
      .map((token) => `/${token}`)
      .join('');
    const told = () => {
      const laid = character.buffs.find(buffname);
      const roundText = round !== undefined && (!laid || buffExpires(laid)) ? `/${round}R` : '';
      return `${bufftext}${roundText}${lookText}`;
    };

    if (piles !== 'none' && character.buffs.find(buffname)) {
      if (piles === 'extend') character.buffs.extendRound(buffname, sub, round, appearance);
      else character.buffs.stackRound(buffname, sub, round, appearance);
      text += `バフを加算 ${describeStandingBuff(character, buffname, told())}    `;
    } else {
      character.buffs.addRound(buffname, sub, round, appearance);
      text += `バフを付与 ${told()}    `;
    }
  }

  return sayToAll(text);
}

/**
 * The states the room keeps, for a removal that tells a debuff from a buff by them; none for a
 * removal that never asks, which leaves the room's list unread.
 */
export function ailmentsForBuffRemoval(rule: BuffRemovalRule): readonly StatusAilment[] {
  return rule.kind === 'buffs' || rule.kind === 'debuffs' ? StatusAilmentCatalog.instance.ailments : [];
}

/**
 * Clears a piece and the parts that go with it of what the rule picks, and says how many buffs went,
 * never which: the names would tell what a piece that hides its buffs wears. The buff a piece rides
 * two up by stays while it rides so.
 */
function clearBuffs(character: GameCharacter, rule: BuffClearanceRule): string {
  const removed = removeBuffsWithParts(character, rule, ailmentsForBuffRemoval(rule));
  if (removed.buffs < 1) return `解除する${describeBuffsLacking(rule)}はありません    `;
  const reach = removed.parts > 0 ? `本体と部位${removed.parts}・` : '';
  return `${describeBuffRemoval(rule)}を解除（${reach}${removed.buffs}件）    `;
}

/**
 * A plain buff naming a state the room keeps, put on as the room describes the state: the note,
 * the rounds and the look the command writes stand in for the state's own, and the rest, the
 * status the state moves among it, is the state's. Laid on top of one already worn, the buff
 * piles on as any plain one does instead.
 */
function plantCommandedState(state: StatusAilment, parts: string[], character: GameCharacter): string {
  const written = splitBuffRounds(parts.slice(2));
  const rounds = written.rounds !== undefined ? Number.parseInt(written.rounds, 10) : Number.NaN;
  const look = parseBuffAppearance(written.look);
  const ailment = statusAilmentAsCommanded(state, {
    note: parts[1] ?? '',
    rounds: Number.isNaN(rounds) ? null : rounds,
    look,
  });
  plantStatusAilment(character, ailment, {
    ...(look.trigger ? { trigger: look.trigger } : {}),
    ...(look.effectTiming ? { effectTiming: look.effectTiming } : {}),
    ...(look.kind ? { kind: look.kind } : {}),
  });
  const counted = ailment.rounds > 0 && ailment.timing !== 'none';
  const told = [ailment.name, ailment.effect, counted ? `${ailment.rounds}R` : '', ...written.look];
  return `バフを付与 ${told.filter((part) => part.length > 0).join('/')}    `;
}

/**
 * A plain buff written in the `&!` layout, `name/status/op/amount/R/…`, read as the plain
 * `name/note/R/…` it stands for, so the rounds written after the amount are the ones it lasts.
 * Read as a plain buff, the operator would stand where the rounds go and the rounds would be
 * taken for its look.
 *
 * Without the mark the status is left where it is; the note says what the buff would move.
 */
export function readModifierLayout(parts: string[]): string[] {
  if (parts.length < 4) return parts;
  const request = parseBuffModifierRequest(parts[1], parts[2], parts[3]);
  if (!request) return parts;
  return [parts[0], describeBuffModifier(request), ...parts.slice(4)];
}

/**
 * How a stacked buff reads once it stands, so the chat line names the total rather than the helping,
 * and the rounds left only for a buff that runs out.
 */
function describeStandingBuff(character: GameCharacter, name: string, fallback: string): string {
  const data = character.buffs.find(name);
  if (!data) return fallback;
  const note = `${data.currentValue ?? ''}`;
  return `${name}${note.length > 0 ? `/${note}` : ''}${buffExpires(data) ? `/${data.value}R` : ''}`;
}
