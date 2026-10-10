import { toHalfWidth } from '@axe/core/util/string-util';
import { parseBuffAppearance } from '@axe/domain/character/buff-appearance';
import { describeBuffModifier, parseBuffModifierRequest } from '@axe/domain/character/buff-modifier';
import { BuffPileOn } from '@axe/domain/character/buff-stack';
import { resolveBuffTiming } from '@axe/domain/character/buff-timing';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
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

  const mat = toHalfWidth(text).match(/([A-CE-Z]+)$/i);
  if (!mat) return ans;

  let option = mat[1];
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

/** A blank edit aimed at a resource's current value, to be filled in by {@link convertCommandToResourceEdit}. */
export function createDefaultResourceEdit(): ResourceEdit {
  return {
    target: '',
    operator: '',
    diceResult: '',
    command: '',
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

  const replaceText = ` ${text.replace('：', ':').replace('＋', '+').replace('－', '-').replace('＝', '=').replace('＞', '>')}`;
  const resourceEditRegExp = /[:]([^-+=>]+)([-+=>])(.*)/;
  const resourceEditResult = replaceText.match(resourceEditRegExp);
  if (!resourceEditResult) return false;
  if (resourceEditResult[2] !== '>' && resourceEditResult[3] === '') return false;

  const named = readNamedResourceSlot(resourceEditResult[1]);
  const reg1 = named.name;
  const reg1HalfWidth = toHalfWidth(reg1);
  oneResourceEdit.nowOrMax = named.slot;

  oneResourceEdit.operator = resourceEditResult[2];

  if (object.status.canChangeName(reg1)) {
    oneResourceEdit.target = reg1;
  } else if (object.status.canChangeName(reg1HalfWidth)) {
    oneResourceEdit.target = reg1HalfWidth;
  } else {
    return false;
  }

  if (oneResourceEdit.operator === '>') {
    oneResourceEdit.replace = resourceEditResult[3];
    return true;
  }

  let reg3 = resourceEditResult[3].replace(/[A-CE-ZＡ-ＣＥ-Ｚ]+$/i, '');
  const commandPrefix = oneResourceEdit.operator === '-' ? '-' : '';
  oneResourceEdit.command = `${commandPrefix}${toHalfWidth(reg3)}+(1d1-1)`;

  reg3 = reg3.replace(/[A-CE-ZＡ-ＣＥ-Ｚ]+$/i, '');
  const optionCommand = parseResourceEditOption(resourceEditResult[3]);
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
 * `&+!` stacks: a second helping moves the status again and the buff remembers both, rather than
 * putting the first one back, and `&++!` lengthens the buff by the rounds asked for as well.
 * Holding a status at a value (`=`) is the one thing that cannot stack, since holding it there
 * twice is still holding it there, so that starts over as always.
 */
function applyCalculatedBuff(command: string, character: GameCharacter, piles: BuffPileOn): string {
  const parts = command.replace(/^[tTｔＴ]?&[!！]/i, '').split('/');
  const name = (parts[0] ?? '').trim();
  if (name.length < 1) return '';

  const request = parseBuffModifierRequest(parts[1] ?? '', parts[2] ?? '', parts[3] ?? '');
  if (!request) return `バフの書式が読めません ${name}    `;

  const roundText = (parts[4] ?? '').trim();
  const round = roundText.length > 0 && Number.isFinite(Number(roundText)) ? Number(roundText) : 3;
  const timing = resolveBuffTiming(parts[5] ?? '') ?? undefined;
  const trigger = (parts[6] ?? '').trim();

  const stacking = piles !== 'none' && request.operator === 'add' && character.buffs.find(name) != null;
  const effect = describeBuffModifier(request);
  const appearance = { timing, trigger: trigger.length > 0 ? trigger : undefined };
  if (!stacking) character.buffs.addRound(name, effect, round, appearance);
  else if (piles === 'extend') character.buffs.extendRound(name, effect, round, appearance);
  else character.buffs.stackRound(name, effect, round, appearance);

  const data = character.buffs.find(name);
  if (!data) return '';
  const applied = stacking
    ? character.buffs.stackModifier(data, request)
    : character.buffs.applyModifier(data, request);
  const verb = stacking ? '加算' : '付与';
  const standing = stacking ? `${data.currentValue ?? effect}` : effect;
  if (!applied) return `${name}を${verb} ${standing}/${data.value}R (${request.target}が見つかりません)    `;

  return `${name}を${verb} ${standing}/${data.value}R    `;
}

/**
 * What second helping the command asks for, and the command with that mark taken off.
 *
 * `&+猛攻撃/攻撃+2/3` adds its `+2` to whatever the standing 猛攻撃 already carries instead of
 * writing over it, and `&++猛攻撃/攻撃+2/3` adds the three rounds to the ones left as well. The
 * mark sits right after the ampersand so that everything downstream reads the command it always
 * read, `&+!` included.
 */
function readBuffStacking(command: string): { piles: BuffPileOn; command: string } {
  const marked = command.match(/^([tTｔＴ]?&)([+＋]{1,2})(?=[^+＋])/);
  if (!marked) return { piles: 'none', command };
  return { piles: marked[2].length > 1 ? 'extend' : 'stack', command: marked[1] + command.slice(marked[0].length) };
}

/**
 * Runs one `&` buff command on the character and returns the chat text reporting it.
 *
 * `&R-` and `&R+` move every buff's remaining rounds, `&D` clears buffs at zero rounds or fewer, `&name-`
 * removes one buff, `&!` adds a buff that changes a status, and anything else adds a plain
 * `name/effect/rounds/appearance` buff. A `+` right after the ampersand stacks onto a buff of the
 * same name rather than starting it over, and `++` lengthens it by the rounds asked for as well.
 * A targeted command's text starts with the character's name.
 */
export function applyBuffEdit(buff: BuffEdit, character: GameCharacter): string {
  const { piles, command } = readBuffStacking(buff.command);
  let text = '';
  if (buff.targeted) {
    text += `[${character.name}] `;
  }

  if (command.match(/^[tTｔＴ]?&[RＲrｒ]-$/i)) {
    character.buffs.decreaseRound();
    text += 'バフRを減少    ';
  } else if (command.match(/^[tTｔＴ]?&[RＲrｒ][+]$/i)) {
    character.buffs.increaseRound();
    text += 'バフRを増加    ';
  } else if (command.match(/^[tTｔＴ]?&[DＤdｄ]$/i)) {
    character.buffs.deleteZeroRound();
    text += '0R以下のバフを消去    ';
  } else if (command.match(/^[tTｔＴ]?&.+-$/i)) {
    const match = command.match(/^[tTｔＴ]?&(.+)-$/i);
    const reg1 = match![1];
    if (character.buffs.delete(reg1)) {
      text += `${reg1}を消去    `;
    }
  } else if (command.match(/^[tTｔＴ]?&[!！]/i)) {
    text += applyCalculatedBuff(command, character, piles);
  } else {
    const splittext = command.replace(/^[tTｔＴ]?&/i, '').split('/');
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

/** How a stacked buff reads once it stands, so the chat line names the total rather than the helping. */
function describeStandingBuff(character: GameCharacter, name: string, fallback: string): string {
  const data = character.buffs.find(name);
  if (!data) return fallback;
  const note = `${data.currentValue ?? ''}`;
  return `${name}${note.length > 0 ? `/${note}` : ''}/${data.value}R`;
}
