import { toHalfWidth } from '@axe/core/util/string-util';
import { parseBuffAppearance } from '@axe/domain/character/buff-appearance';
import {
  buffCommandKind,
  readBuffStacking,
  readCalculatedBuff,
  readCalculatedBuffLook,
  removedBuffName,
} from '@axe/domain/character/buff-command';
import {
  describeBuffModifier,
  describeBuffModifierTarget,
  parseBuffModifierRequest,
  ParsedBuffModifierRequest,
} from '@axe/domain/character/buff-modifier';
import { BuffPileOn } from '@axe/domain/character/buff-stack';
import { GameCharacter } from '@axe/domain/character/game-character';
import { findStatusAilment, type StatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { plantStatusAilment, statusAilmentAsCommanded } from '@axe/domain/character/status-ailment-plant';
import { DataElement } from '@axe/domain/data/data-element';
import { findEmbeddedRolls, replaceEmbeddedRolls } from '@axe/domain/data/embedded-roll';
import { resourceCommandParts } from '@axe/domain/data/resource-command-words';
import { readNamedResourceSlot, type ResourceSlot, resourceSlotLabel } from '@axe/domain/data/resource-slot';

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
  const reg1 = named.name;
  const reg1HalfWidth = toHalfWidth(reg1);
  oneResourceEdit.nowOrMax = named.slot;

  oneResourceEdit.operator = parts.operator;

  if (object.status.canChangeName(reg1)) {
    oneResourceEdit.target = reg1;
  } else if (object.status.canChangeName(reg1HalfWidth)) {
    oneResourceEdit.target = reg1HalfWidth;
  } else {
    return false;
  }

  if (oneResourceEdit.operator === '>') {
    oneResourceEdit.replace = parts.amount;
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

/** Writes a `>` command's text into the character's status and returns the chat text reporting it. */
export function applyTextEdit(edit: ResourceEdit, character: GameCharacter): string {
  character.status.setText(edit.target, edit.replace);
  return `${edit.target}＞${edit.replace}    `;
}

/**
 * Applies a worked-out resource change to the character and returns the chat text reporting old and new
 * values.
 *
 * The text notes when an option or the stored bounds held the value back, and when changing a base or
 * correction moved the effective bounds or the current maximum. An edit of the maximum on a status without
 * one changes the current value instead. Returns an empty string when the status has no value to change.
 */
export function applyResourceEdit(edit: ResourceEdit, character: GameCharacter): string {
  let optionText = '';
  let nowOrMax = edit.nowOrMax;

  const maxNum = character.status.getValue(edit.target, 'max');
  if (nowOrMax === 'max' && maxNum == null) {
    nowOrMax = 'now';
  }

  const oldNum = character.status.getValue(edit.target, nowOrMax);
  if (oldNum == null) return '';

  // Snapshot effective bounds BEFORE applying so we can report shifts when corrections move them.
  const targetElement = character.detailDataElement
    ? DataElement.findElementByReference(character.detailDataElement, edit.target)
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
  return `${edit.target}${suffix}:${oldNum}${operatorText}${edit.diceResult}＞${newNum}${optionText}${sideEffectText}    `;
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
 * `&+!` stacks: a second helping moves the status again and the buff remembers both, rather than
 * putting the first one back, and `&++!` lengthens the buff by the rounds asked for as well.
 * Holding a status at a value (`=`) is the one thing that cannot stack, since holding it there
 * twice is still holding it there, so that starts over as always. For the same reason a helping
 * stacked on a buff that holds its status leaves the status held, adding only to the rounds.
 */
function applyCalculatedBuff(command: string, character: GameCharacter, piles: BuffPileOn): string {
  const { name, requests, rest } = readCalculatedBuff(command);
  if (name.length < 1) return '';
  if (!requests) return `バフの書式が読めません ${name}    `;
  return grantCalculatedBuff(character, name, requests, rest, piles);
}

/**
 * Lays a buff of one row a status, or stacks it, and says in the chat what it did. A single status
 * stacked on a buff of several leaves the buff marked as several; laid anew, it is one again.
 */
function grantCalculatedBuff(
  character: GameCharacter,
  name: string,
  requests: readonly ParsedBuffModifierRequest[],
  rest: readonly string[],
  piles: BuffPileOn
): string {
  const roundText = (rest[0] ?? '').trim();
  const round = roundText.length > 0 && Number.isFinite(Number(roundText)) ? Number(roundText) : 3;
  const stacking =
    piles !== 'none' && requests.every((request) => request.operator === 'add') && character.buffs.find(name) != null;
  if (!stacking) character.buffs.removeGroupMembers(name);
  const grouped = requests.length > 1;
  const group = grouped ? name : stacking ? undefined : '';
  const appearance = { ...readCalculatedBuffLook(rest.slice(1)), group };

  const missing: string[] = [];
  const effects: string[] = [];
  requests.forEach((request, index) => {
    const rowName = index === 0 ? name : `${name}（${describeBuffModifierTarget(request)}）`;
    const effect = describeBuffModifier(request);
    const rowStacking = stacking && character.buffs.find(rowName) != null;
    if (!rowStacking) character.buffs.addRound(rowName, effect, round, appearance);
    else if (piles === 'extend') character.buffs.extendRound(rowName, effect, round, appearance);
    else character.buffs.stackRound(rowName, effect, round, appearance);

    const data = character.buffs.find(rowName);
    if (!data) return;
    const applied = rowStacking
      ? character.buffs.stackModifier(data, request)
      : character.buffs.applyModifier(data, request);
    if (!applied) missing.push(request.target);
    effects.push(rowStacking ? `${data.currentValue ?? effect}` : effect);
  });

  const data = character.buffs.find(name);
  if (!data) return '';
  const verb = stacking ? '加算' : '付与';
  const lack = missing.length > 0 ? ` (${missing.join('・')}が見つかりません)` : '';
  return `${name}を${verb} ${effects.join(',')}/${data.value}R${lack}    `;
}

/**
 * Runs one `&` buff command on the character and returns the chat text reporting it.
 *
 * `&R-` and `&R+` move every buff's remaining rounds, `&D` clears buffs at zero rounds or fewer, `&name-`
 * removes one buff, `&!` adds a buff that changes a status, and anything else adds a plain
 * `name/effect/rounds/appearance` buff; one named after a state the room keeps puts that state on,
 * what the command leaves out read from the room's list of states. A `+` right after the ampersand
 * stacks onto a buff of the same name rather than starting it over, and `++` lengthens it by the
 * rounds asked for as well. A targeted command's text starts with the character's name.
 */
export function applyBuffEdit(buff: BuffEdit, character: GameCharacter): string {
  const { piles, command } = readBuffStacking(buff.command);
  let text = '';
  if (buff.targeted) {
    text += `[${character.name}] `;
  }

  const kind = buffCommandKind(command);
  if (kind === 'roundsDown') {
    character.buffs.decreaseRound();
    text += 'バフRを減少    ';
  } else if (kind === 'roundsUp') {
    character.buffs.increaseRound();
    text += 'バフRを増加    ';
  } else if (kind === 'clearZero') {
    character.buffs.deleteZeroRound();
    text += '0R以下のバフを消去    ';
  } else if (kind === 'remove') {
    const reg1 = removedBuffName(command);
    if (character.buffs.delete(reg1)) {
      text += `${reg1}を消去    `;
    }
  } else if (kind === 'calculated') {
    text += applyCalculatedBuff(command, character, piles);
  } else {
    const splittext = readModifierLayout(command.replace(/^[tTｔＴ]?&/i, '').split('/'));
    const state = findStatusAilment(StatusAilmentCatalog.instance.ailments, splittext[0]);
    if (state && (piles === 'none' || !character.buffs.find(state.name))) {
      return text + plantCommandedState(state, splittext, character);
    }
    let round: number | undefined = undefined;
    let sub = '';
    const buffname = splittext[0];
    let bufftext = splittext[0];

    if (splittext.length > 1) {
      sub = splittext[1];
      bufftext = `${bufftext}/${splittext[1]}`;
    }
    if (splittext.length > 2) {
      if (splittext[2]) {
        round = parseInt(splittext[2]);
        if (Number.isNaN(round)) {
          round = 3;
        }
      } else {
        round = 3;
      }
      bufftext = `${bufftext}/${round}R`;
    }

    const appearance = parseBuffAppearance(splittext.slice(3));
    for (const token of splittext.slice(3)) {
      if (token) bufftext = `${bufftext}/${token}`;
    }

    if (piles !== 'none' && character.buffs.find(buffname)) {
      if (piles === 'extend') character.buffs.extendRound(buffname, sub, round, appearance);
      else character.buffs.stackRound(buffname, sub, round, appearance);
      text += `バフを加算 ${describeStandingBuff(character, buffname, bufftext)}    `;
    } else {
      character.buffs.addRound(buffname, sub, round, appearance);
      text += `バフを付与 ${bufftext}    `;
    }
  }

  return text;
}

/**
 * A plain buff naming a state the room keeps, put on as the room describes the state: the note,
 * the rounds and the look the command writes stand in for the state's own, and the rest, the
 * status the state moves among it, is the state's. Laid on top of one already worn, the buff
 * piles on as any plain one does instead.
 */
function plantCommandedState(state: StatusAilment, parts: string[], character: GameCharacter): string {
  const rounds = parts.length > 2 ? Number.parseInt(parts[2], 10) : Number.NaN;
  const look = parseBuffAppearance(parts.slice(3));
  const ailment = statusAilmentAsCommanded(state, {
    note: parts[1] ?? '',
    rounds: Number.isNaN(rounds) ? null : rounds,
    look,
  });
  plantStatusAilment(character, ailment, look.trigger ? { trigger: look.trigger } : {});
  const told = [ailment.name, ailment.effect, ailment.rounds > 0 ? `${ailment.rounds}R` : '', ...parts.slice(3)];
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

/** How a stacked buff reads once it stands, so the chat line names the total rather than the helping. */
function describeStandingBuff(character: GameCharacter, name: string, fallback: string): string {
  const data = character.buffs.find(name);
  if (!data) return fallback;
  const note = `${data.currentValue ?? ''}`;
  return `${name}${note.length > 0 ? `/${note}` : ''}/${data.value}R`;
}
