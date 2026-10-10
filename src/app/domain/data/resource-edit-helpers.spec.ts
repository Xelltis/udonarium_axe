import { resolveBuffColor } from '@axe/domain/character/buff-appearance';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';
import {
  applyBuffEdit,
  applyResourceEdit,
  applyTextEdit,
  type BuffEdit,
  convertCommandToResourceEdit,
  createDefaultResourceEdit,
  parseResourceEditOption,
  type ResourceEdit,
} from '@axe/domain/data/resource-edit-helpers';

describe('resource-edit-helpers', () => {
  describe('parseResourceEditOption', () => {
    it('is false throughout with no options given', () => {
      const result = parseResourceEditOption('HP+10');
      expect(result.limitMinMax).toBe(false);
      expect(result.zeroLimit).toBe(false);
      expect(result.isErr).toBe(false);
    });

    it('takes two options together', () => {
      const result = parseResourceEditOption('HP+10LZ');
      expect(result.limitMinMax).toBe(true);
      expect(result.zeroLimit).toBe(true);
      expect(result.isErr).toBe(false);
    });

    it('reports an error for an option letter it does not know', () => {
      expect(parseResourceEditOption('HP+10X').isErr).toBe(true);
    });
  });

  describe('createDefaultResourceEdit', () => {
    it('returns the defaults', () => {
      const edit = createDefaultResourceEdit();
      expect(edit.target).toBe('');
      expect(edit.operator).toBe('');
      expect(edit.nowOrMax).toBe('now');
      expect(edit.isDiceRoll).toBe(false);
      expect(edit.calcAns).toBe(0);
    });
  });

  describe('convertCommandToResourceEdit', () => {
    let character: GameCharacter;

    beforeEach(() => {
      character = GameCharacter.create('テスト戦士', 1, '');
    });

    it('reads a command that adds to a resource', () => {
      const edit = createDefaultResourceEdit();

      const ok = convertCommandToResourceEdit(edit, ':HP+10', character, false);

      expect(ok).toBe(true);
      expect(edit.target).toBe('HP');
      expect(edit.operator).toBe('+');
      expect(edit.command).toBe('10+(1d1-1)');
      expect(edit.targeted).toBe(false);
    });

    it('aims at the maximum when it is marked', () => {
      const edit = createDefaultResourceEdit();

      const ok = convertCommandToResourceEdit(edit, ':HP^+50', character, true);

      expect(ok).toBe(true);
      expect(edit.nowOrMax).toBe('max');
      expect(edit.targeted).toBe(true);
    });

    it('aims at the base maximum from one suffix', () => {
      const edit = createDefaultResourceEdit();
      const ok = convertCommandToResourceEdit(edit, ':HP_MAX+5', character, false);
      expect(ok).toBe(true);
      expect(edit.nowOrMax).toBe('maxBase');
      expect(edit.target).toBe('HP');
    });

    it('aims at its correction from another', () => {
      const edit = createDefaultResourceEdit();
      const ok = convertCommandToResourceEdit(edit, ':HP_MAX_BUFF+5', character, false);
      expect(ok).toBe(true);
      expect(edit.nowOrMax).toBe('maxCorrection');
      expect(edit.target).toBe('HP');
    });

    it('aims at the base minimum from a third', () => {
      const edit = createDefaultResourceEdit();
      const ok = convertCommandToResourceEdit(edit, ':HP_MIN-3', character, false);
      expect(ok).toBe(true);
      expect(edit.nowOrMax).toBe('minBase');
      expect(edit.target).toBe('HP');
    });

    it('aims at its correction from a fourth', () => {
      const edit = createDefaultResourceEdit();
      const ok = convertCommandToResourceEdit(edit, ':HP_MIN_BUFF-3', character, false);
      expect(ok).toBe(true);
      expect(edit.nowOrMax).toBe('minCorrection');
      expect(edit.target).toBe('HP');
    });

    it('pays no attention to the case of a suffix', () => {
      const edit = createDefaultResourceEdit();
      const ok = convertCommandToResourceEdit(edit, ':HP_max_buff+5', character, false);
      expect(ok).toBe(true);
      expect(edit.nowOrMax).toBe('maxCorrection');
    });

    it('is false for a status it does not have', () => {
      const edit = createDefaultResourceEdit();
      expect(convertCommandToResourceEdit(edit, ':存在しない+10', character, false)).toBe(false);
    });
  });

  describe('applyTextEdit / applyResourceEdit / applyBuffEdit', () => {
    let character: GameCharacter;

    beforeEach(() => {
      character = GameCharacter.create('テスト戦士', 1, '');
    });

    it('writes to a text value', () => {
      const edit = createDefaultResourceEdit();
      edit.target = '器用度';
      edit.replace = '30';

      const text = applyTextEdit(edit, character);

      expect(text).toContain('器用度＞30');
    });

    it('assigns the current value', () => {
      const edit: ResourceEdit = {
        ...createDefaultResourceEdit(),
        target: 'HP',
        operator: '=',
        diceResult: '50',
        command: '50+(1d1-1)',
        calcAns: 50,
        option: { limitMinMax: false, zeroLimit: false, isErr: false },
        object: character,
      };

      const text = applyResourceEdit(edit, character);

      expect(text).toContain('50');
      expect(character.status.getValue('HP', 'now')).toBe(50);
    });

    it('returns the text of a buff it granted', () => {
      const buff: BuffEdit = { command: '&マッスルベアー/筋B+2/3', object: character, targeted: false };

      const text = applyBuffEdit(buff, character);

      expect(text).toContain('バフを付与');
      expect(text).toContain('マッスルベアー');
    });

    it('takes the look of that buff after the first three words', () => {
      const buff: BuffEdit = { command: '&毒/継続2/3/red/☠️', object: character, targeted: false };

      const text = applyBuffEdit(buff, character);
      const data = character.buffDataElement!.children[0].children[0] as DataElement;

      expect(text).toContain('red');
      expect(data.getAttribute(DataElementAttribute.BUFF_COLOR)).toBe(resolveBuffColor('red'));
      expect(data.getAttribute(DataElementAttribute.BUFF_ICON)).toBe('☠️');
    });

    it('writes a plain buff over one of the same name', () => {
      applyBuffEdit({ command: '&猛攻撃/攻撃+2/3', object: character, targeted: false }, character);
      applyBuffEdit({ command: '&猛攻撃/攻撃+2/3', object: character, targeted: false }, character);

      expect(character.buffs.find('猛攻撃')!.currentValue).toBe('攻撃+2');
    });

    it('adds a second helping to a plain buff when the command is marked with a plus', () => {
      applyBuffEdit({ command: '&猛攻撃/攻撃+2/3', object: character, targeted: false }, character);
      const text = applyBuffEdit({ command: '&+猛攻撃/攻撃+2/3', object: character, targeted: false }, character);

      expect(character.buffs.find('猛攻撃')!.currentValue).toBe('攻撃+4');
      expect(text).toContain('バフを加算');
      expect(text).toContain('攻撃+4');
    });

    it('reads the plus written full width', () => {
      applyBuffEdit({ command: '&猛攻撃/攻撃+2/3', object: character, targeted: false }, character);
      applyBuffEdit({ command: '&＋猛攻撃/攻撃+2/3', object: character, targeted: false }, character);

      expect(character.buffs.find('猛攻撃')!.currentValue).toBe('攻撃+4');
    });

    it('leaves the longer count of rounds standing for one plus', () => {
      applyBuffEdit({ command: '&猛攻撃/攻撃+2/5', object: character, targeted: false }, character);
      applyBuffEdit({ command: '&+猛攻撃/攻撃+2/2', object: character, targeted: false }, character);

      expect(character.buffs.find('猛攻撃')!.value).toBe(5);
    });

    it('lengthens the buff by the rounds asked for on two pluses', () => {
      applyBuffEdit({ command: '&猛攻撃/攻撃+2/2', object: character, targeted: false }, character);
      const text = applyBuffEdit({ command: '&++猛攻撃/攻撃+2/3', object: character, targeted: false }, character);

      const data = character.buffs.find('猛攻撃')!;
      expect(data.value).toBe(5);
      expect(data.currentValue).toBe('攻撃+4');
      expect(text).toContain('5R');
    });

    it('lengthens a buff without changing what it says when no note is given', () => {
      applyBuffEdit({ command: '&加護/守り+1/2', object: character, targeted: false }, character);
      applyBuffEdit({ command: '&++加護//3', object: character, targeted: false }, character);

      const data = character.buffs.find('加護')!;
      expect(data.value).toBe(5);
      expect(data.currentValue).toBe('守り+1');
    });

    it('lengthens a calculated buff and moves the status again', () => {
      character.status.changeValue('HP', 'now', -100);
      const before = character.status.getValue('HP', 'now')!;

      applyBuffEdit({ command: '&!猛攻撃/HP/+/2/2', object: character, targeted: false }, character);
      applyBuffEdit({ command: '&++!猛攻撃/HP/+/2/3', object: character, targeted: false }, character);

      expect(character.status.getValue('HP', 'now')).toBe(before + 4);
      expect(character.buffs.find('猛攻撃')!.value).toBe(5);
    });

    it('grants a marked buff nobody carries yet', () => {
      const text = applyBuffEdit({ command: '&+猛攻撃/攻撃+2/3', object: character, targeted: false }, character);

      expect(character.buffs.find('猛攻撃')!.currentValue).toBe('攻撃+2');
      expect(text).toContain('バフを付与');
    });

    it('still removes a buff written with the mark and a dash', () => {
      applyBuffEdit({ command: '&猛攻撃/攻撃+2/3', object: character, targeted: false }, character);
      applyBuffEdit({ command: '&+猛攻撃-', object: character, targeted: false }, character);

      expect(character.buffs.find('猛攻撃')).toBeNull();
    });

    it('moves a status twice over for a marked calculated buff', () => {
      character.status.changeValue('HP', 'now', -100);
      const before = character.status.getValue('HP', 'now')!;

      applyBuffEdit({ command: '&!猛攻撃/HP/+/2/3', object: character, targeted: false }, character);
      const text = applyBuffEdit({ command: '&+!猛攻撃/HP/+/2/3', object: character, targeted: false }, character);

      expect(character.status.getValue('HP', 'now')).toBe(before + 4);
      expect(text).toContain('加算');
      expect(text).toContain('HP+4');
    });

    it('puts back both helpings when a marked calculated buff is taken off', () => {
      character.status.changeValue('HP', 'now', -100);
      const before = character.status.getValue('HP', 'now')!;

      applyBuffEdit({ command: '&!猛攻撃/HP/+/2/3', object: character, targeted: false }, character);
      applyBuffEdit({ command: '&+!猛攻撃/HP/+/2/3', object: character, targeted: false }, character);
      expect(character.status.getValue('HP', 'now')).toBe(before + 4);

      applyBuffEdit({ command: '&猛攻撃-', object: character, targeted: false }, character);

      expect(character.status.getValue('HP', 'now')).toBe(before);
    });

    it('starts a calculated buff over where it only holds a status at a value', () => {
      applyBuffEdit({ command: '&!石化/HP/=/3/3', object: character, targeted: false }, character);
      applyBuffEdit({ command: '&+!石化/HP/=/3/3', object: character, targeted: false }, character);

      expect(character.status.getValue('HP', 'now')).toBe(3);
    });

    it('writes an unmarked calculated buff over the one standing', () => {
      character.status.changeValue('HP', 'now', -100);
      const before = character.status.getValue('HP', 'now')!;

      applyBuffEdit({ command: '&!猛攻撃/HP/+/2/3', object: character, targeted: false }, character);
      applyBuffEdit({ command: '&!猛攻撃/HP/+/2/3', object: character, targeted: false }, character);

      expect(character.status.getValue('HP', 'now')).toBe(before + 2);
    });
  });
});
