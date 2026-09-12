import { toHalfWidth } from '@axe/core/util/string-util';
import { parseBuffAppearance } from '@axe/domain/character/buff-appearance';
import { describeBuffModifier, parseBuffModifierRequest } from '@axe/domain/character/buff-modifier';
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

export function applyTextEdit(edit: ResourceEdit, character: GameCharacter): string {
  character.status.setText(edit.target, edit.replace);
  return `${edit.target}＞${edit.replace}    `;
}

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
 */
function applyCalculatedBuff(command: string, character: GameCharacter): string {
  const parts = command.replace(/^[tTｔＴ]?&[!！]/i, '').split('/');
  const name = (parts[0] ?? '').trim();
  if (name.length < 1) return '';

  const request = parseBuffModifierRequest(parts[1] ?? '', parts[2] ?? '', parts[3] ?? '');
  if (!request) return `バフの書式が読めません ${name}    `;

  const roundText = (parts[4] ?? '').trim();
  const round = roundText.length > 0 && Number.isFinite(Number(roundText)) ? Number(roundText) : 3;
  const timing = resolveBuffTiming(parts[5] ?? '') ?? undefined;
  const trigger = (parts[6] ?? '').trim();

  const effect = describeBuffModifier(request);
  character.buffs.addRound(name, effect, round, { timing, trigger: trigger.length > 0 ? trigger : undefined });

  const data = character.buffs.find(name);
  if (!data) return '';
  const applied = character.buffs.applyModifier(data, request);
  if (!applied) return `${name}を付与 ${effect}/${round}R (${request.target}が見つかりません)    `;

  return `${name}を付与 ${effect}/${round}R    `;
}

export function applyBuffEdit(buff: BuffEdit, character: GameCharacter): string {
  const command = buff.command;
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
    text += applyCalculatedBuff(command, character);
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

    character.buffs.addRound(buffname, sub, round, appearance);
    text += `バフを付与 ${bufftext}    `;
  }

  return text;
}
