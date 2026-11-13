import { resolveBuffColor } from '@axe/domain/character/buff-appearance';
import { toBuffBadges } from '@axe/domain/character/buff-badge';
import { GameCharacter } from '@axe/domain/character/game-character';
import { newStatusAilment, type StatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
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

    it("takes a division's rounding for part of the amount, and the letters after it for options", () => {
      expect(parseResourceEditOption('HP+12/2C')).toEqual({ limitMinMax: false, zeroLimit: false, isErr: false });
      expect(parseResourceEditOption('HP+12/(1+3)RL')).toEqual({ limitMinMax: true, zeroLimit: false, isErr: false });
      expect(parseResourceEditOption('HP+12/2X').isErr).toBe(true);
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

    it("keeps a division's rounding in the amount, the option letters after it out", () => {
      const edit = createDefaultResourceEdit();

      const ok = convertCommandToResourceEdit(edit, ':HP+12/2CL', character, false);

      expect(ok).toBe(true);
      expect(edit.amount).toBe('12/2C');
      expect(edit.option?.limitMinMax).toBe(true);
    });

    it('rounds a division it takes away before the minus comes in, and leaves the rest of the amount as written', () => {
      const edit = createDefaultResourceEdit();

      convertCommandToResourceEdit(edit, ':HP-13/2F+1', character, false);
      expect(edit.command).toBe('-(13/2F)+1+(1d1-1)');

      convertCommandToResourceEdit(edit, ':HP-5+3', character, false);
      expect(edit.command).toBe('-5+3+(1d1-1)');

      convertCommandToResourceEdit(edit, ':HP-[13/2C]+1', character, false);
      expect(edit.command).toBe('-[13/2C]+1+(1d1-1)');
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

    it('reads a plain buff written in the layout of a calculated one, rounds and all, and moves nothing', () => {
      const before = character.status.getValue('HP', 'now');

      const text = applyBuffEdit({ command: '&挑発攻撃/HP/-/2/1', object: character, targeted: false }, character);
      const data = character.buffs.find('挑発攻撃')!;

      expect(text).toBe('バフを付与 挑発攻撃/HP-2/1R    ');
      expect(data.value).toBe(1);
      expect(data.currentValue).toBe('HP-2');
      expect(data.getAttribute(DataElementAttribute.BUFF_ICON) ?? '').toBe('');
      expect(character.status.getValue('HP', 'now')).toBe(before);
      expect(character.buffs.expireOneRound()).toEqual(['挑発攻撃']);
    });

    it('keeps reading a plain buff whose third word is not an operator as its rounds', () => {
      applyBuffEdit({ command: '&猛攻撃/攻撃+2/2/red', object: character, targeted: false }, character);

      expect(character.buffs.find('猛攻撃')!.value).toBe(2);
      expect(character.buffs.find('猛攻撃')!.currentValue).toBe('攻撃+2');
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

    it('grants a buff that builds up at every count, written with a doubled operator as a player writes it', () => {
      character.status.changeValue('HP', 'now', -100);
      const before = character.status.getValue('HP', 'now')!;

      const text = applyBuffEdit({ command: '&+!猛攻撃/HP/++/1/3', object: character, targeted: false }, character);
      character.buffs.expireOneRound();

      expect(text).toBe('猛攻撃を付与 HP+1~+1/3R    ');
      expect(character.status.getValue('HP', 'now')).toBe(before + 2);
    });

    it('dresses a buff that moves a status in the look written after its rounds', () => {
      character.detailDataElement!.appendChild(DataElement.create('膂力', 10, {}));

      applyBuffEdit(
        { command: '&!練技/膂力+2/3/blue/💪/手番開始/@術者', object: character, targeted: false },
        character
      );
      const data = character.buffs.find('練技')!;

      expect(character.status.getValue('膂力', 'now')).toBe(12);
      expect(data.getAttribute(DataElementAttribute.BUFF_ICON)).toBe('💪');
      expect(data.getAttribute(DataElementAttribute.BUFF_COLOR)).toBe(resolveBuffColor('blue'));
      expect(data.getAttribute(DataElementAttribute.BUFF_TIMING)).toBe('turnStart');
      expect(data.getAttribute(DataElementAttribute.BUFF_TRIGGER)).toBe('術者');
    });

    describe('a buff written to stay until it is taken away', () => {
      const timingOf = (name: string) => character.buffs.find(name)?.getAttribute(DataElementAttribute.BUFF_TIMING);

      it('reads none after the rounds as the timing, rather than as the default colour', () => {
        applyBuffEdit({ command: '&加護/防御+2/3/none', object: character, targeted: false }, character);
        applyBuffEdit({ command: '&呪い/攻撃-1/3/なし/red', object: character, targeted: false }, character);

        expect(timingOf('加護')).toBe('none');
        expect(timingOf('呪い')).toBe('none');
        expect(character.buffs.find('呪い')!.getAttribute(DataElementAttribute.BUFF_COLOR)).toBe(
          resolveBuffColor('red')
        );
      });

      it('reads a timing where the rounds go as the rounds left out', () => {
        const told = applyBuffEdit({ command: '&加護/防御+2/none', object: character, targeted: false }, character);

        expect(timingOf('加護')).toBe('none');
        expect(told).toBe('バフを付与 加護/防御+2/none    ');
      });

      it('tells of no rounds for a buff that stays, however it is laid', () => {
        character.detailDataElement!.appendChild(DataElement.create('命中', 5, {}));
        const edit = (command: string) => applyBuffEdit({ command, object: character, targeted: false }, character);

        expect(edit('&加護/防御+2/3/none')).toBe('バフを付与 加護/防御+2/none    ');
        expect(edit('&+加護/防御+1/2')).toBe('バフを加算 加護/防御+3    ');
        expect(edit('&!集中/命中/+/1/none')).toBe('集中を付与 命中+1    ');
        expect(edit('&呪い/攻撃-1/3')).toBe('バフを付与 呪い/攻撃-1/3R    ');
      });

      it('keeps a buff that moves a status, as the buff manager writes one that stays', () => {
        character.detailDataElement!.appendChild(DataElement.create('命中', 5, {}));

        applyBuffEdit({ command: '&!猛攻撃/命中/+/2/3/none', object: character, targeted: false }, character);
        applyBuffEdit({ command: '&!集中/命中/+/1/none', object: character, targeted: false }, character);

        expect(timingOf('猛攻撃')).toBe('none');
        expect(timingOf('集中')).toBe('none');
        expect(character.status.getValue('命中', 'now')).toBe(8);
      });
    });

    describe('a buff named after a state the room keeps', () => {
      const edit = (command: string, targeted = false) =>
        applyBuffEdit({ command, object: character, targeted }, character);
      const fallen: StatusAilment = {
        name: '転倒',
        color: 'gray',
        icon: '🤕',
        rounds: 1,
        timing: 'turnEnd',
        effect: '回避-2。起き上がるまで移動できない',
        stat: '',
        op: '',
        amount: '',
      };
      const stunned: StatusAilment = {
        ...newStatusAilment('麻痺'),
        effect: '行動できない',
        stat: '回避',
        op: '=',
        amount: '0',
      };

      beforeEach(() => {
        StatusAilmentCatalog.instance.ailments = [fallen, stunned];
        character.detailDataElement!.appendChild(DataElement.create('回避', 6, {}));
      });

      afterEach(() => {
        StatusAilmentCatalog.instance.ailments = [];
      });

      it('puts the state on as the room describes it when the command gives the name alone', () => {
        const text = edit('t&転倒', true);
        const data = character.buffs.find('転倒')!;

        expect(text).toBe('[テスト戦士] バフを付与 転倒/回避-2。起き上がるまで移動できない/1R    ');
        expect(data.currentValue).toBe(fallen.effect);
        expect(data.value).toBe(1);
        expect(data.getAttribute(DataElementAttribute.BUFF_ICON)).toBe('🤕');
        expect(data.getAttribute(DataElementAttribute.BUFF_COLOR)).toBe('gray');
        expect(data.getAttribute(DataElementAttribute.BUFF_TIMING)).toBe('turnEnd');
      });

      it('lays the state to stay with a timing where the rounds go, and tells of no rounds', () => {
        const text = edit('&転倒/起き上がるまで/none');
        const data = character.buffs.find('転倒')!;

        expect(text).toBe('バフを付与 転倒/起き上がるまで/none    ');
        expect(data.getAttribute(DataElementAttribute.BUFF_TIMING)).toBe('none');
      });

      it('takes what the command writes in place of the state, and the state for the rest', () => {
        edit('&転倒/起き上がるまで/3/blue');
        const data = character.buffs.find('転倒')!;

        expect(data.currentValue).toBe('起き上がるまで');
        expect(data.value).toBe(3);
        expect(data.getAttribute(DataElementAttribute.BUFF_COLOR)).toBe(resolveBuffColor('blue'));
        expect(data.getAttribute(DataElementAttribute.BUFF_ICON)).toBe('🤕');
      });

      it('moves the status the state names, and gives it back as the state comes off', () => {
        edit('&麻痺');

        expect(character.status.getValue('回避', 'now')).toBe(0);
        expect(character.buffs.find('麻痺')!.currentValue).toBe('行動できない');

        edit('&麻痺-');

        expect(character.status.getValue('回避', 'now')).toBe(6);
      });

      it('leaves the status a state marks with a colon moved, at every count and once it comes off', () => {
        StatusAilmentCatalog.instance.ailments = [
          {
            ...newStatusAilment('毒'),
            rounds: 2,
            timing: 'roundEnd',
            effect: '毎R2点',
            stat: ':回避',
            op: '+',
            amount: '0~-2',
          },
        ];

        edit('&毒');
        character.buffs.expireOneRound();
        expect(character.status.getValue('回避', 'now')).toBe(4);
        character.buffs.expireOneRound();

        expect(character.buffs.find('毒')).toBeNull();
        expect(character.status.getValue('回避', 'now')).toBe(2);
      });

      it('piles onto the state already worn as any plain buff does', () => {
        edit('&転倒');

        edit('&++転倒//2');

        const data = character.buffs.find('転倒')!;
        expect(data.value).toBe(3);
        expect(data.currentValue).toBe(fallen.effect);
      });

      it('leaves a buff the room keeps no state of as plain as before', () => {
        edit('&転倒しそう');

        expect(character.buffs.find('転倒しそう')!.currentValue).toBe('');
      });
    });

    describe('a buff that moves several statuses', () => {
      const edit = (command: string) => applyBuffEdit({ command, object: character, targeted: false }, character);
      const value = (name: string) => character.status.getValue(name, 'now');
      const rows = () => character.buffs.list().map((row) => [row.name, row.getAttribute('cs-buff-group')]);

      beforeEach(() => {
        for (const [name, amount] of [
          ['追D', 0],
          ['回避', 10],
          ['技量', 12],
        ] as const) {
          character.detailDataElement!.appendChild(DataElement.create(name, amount, {}));
        }
      });

      it('moves each status a row apiece, and shows them as the one buff', () => {
        const text = edit('&!全力攻撃/追D+4,回避-2/1/turnStart');

        expect(text).toBe('全力攻撃を付与 追D+4,回避-2/1R    ');
        expect(value('追D')).toBe(4);
        expect(value('回避')).toBe(8);
        expect(rows()).toEqual([
          ['全力攻撃', '全力攻撃'],
          ['全力攻撃（回避）', '全力攻撃'],
        ]);
        const badges = toBuffBadges(character.buffDataElement ?? null);
        expect(badges.map((badge) => [badge.name, badge.effect])).toEqual([['全力攻撃', '追D+4,回避-2']]);
      });

      it('takes every row off by the buff name, putting back what each moved', () => {
        edit('&!全力攻撃/追D+4,回避-2/1');

        expect(edit('&全力攻撃-')).toBe('全力攻撃を消去    ');

        expect(character.buffs.list()).toHaveLength(0);
        expect([value('追D'), value('回避')]).toEqual([0, 10]);
      });

      it('lays the buff anew with only the statuses it moves now', () => {
        edit('&!全力攻撃/追D+4,回避-2/1');

        edit('&!全力攻撃/追D/+/2/1');

        expect(rows()).toEqual([['全力攻撃', '']]);
        expect([value('追D'), value('回避')]).toEqual([2, 10]);
      });

      it('stacks every row on a second helping', () => {
        edit('&!全力攻撃/追D+4,回避-2/1');

        expect(edit('&+!全力攻撃/追D+1,回避-1/1')).toBe('全力攻撃を加算 追D+5,回避-3/1R    ');

        expect([value('追D'), value('回避')]).toEqual([5, 7]);
      });

      it('keeps the buff as one of several when a single status is stacked on it', () => {
        edit('&!全力攻撃/追D+4,回避-2/1');

        edit('&+!全力攻撃/追D/+/1/1');

        expect(rows()).toEqual([
          ['全力攻撃', '全力攻撃'],
          ['全力攻撃（回避）', '全力攻撃'],
        ]);
        const badges = toBuffBadges(character.buffDataElement ?? null);
        expect(badges.map((badge) => badge.effect)).toEqual(['追D+5,回避-2']);
        expect([value('追D'), value('回避')]).toEqual([5, 8]);
      });

      it('moves a status at every count in a row of its own, as a single buff does', () => {
        edit('&!変身/技量+5~-1,回避-2/3');
        character.buffs.expireOneRound();

        expect(value('技量')).toBe(16);
        expect(value('回避')).toBe(8);
      });

      it('leaves a status marked with a colon moved as the buff runs out, beside one it gives back', () => {
        expect(edit('&!毒/回避-2,:技量+0~-3/2')).toBe('毒を付与 回避-2,:技量+0~-3/2R    ');
        character.buffs.expireOneRound();
        character.buffs.expireOneRound();

        expect(character.buffs.list()).toHaveLength(0);
        expect([value('技量'), value('回避')]).toEqual([6, 10]);
      });

      it('reads a single status written in the newer way as the older one', () => {
        expect(edit('&!猛攻撃/追D+2/3')).toBe('猛攻撃を付与 追D+2/3R    ');
        expect(rows()).toEqual([['猛攻撃', '']]);
      });
    });

    it('works out a calculated buff whose amount is written as a sum', () => {
      character.status.changeValue('HP', 'now', -100);
      const before = character.status.getValue('HP', 'now')!;

      const text = applyBuffEdit({ command: '&!鼓舞/HP/+/(3+4)÷2/1', object: character, targeted: false }, character);

      expect(character.status.getValue('HP', 'now')).toBe(before + 3);
      expect(character.buffs.find('鼓舞')!.value).toBe(1);
      expect(text).toBe('鼓舞を付与 HP+3/1R    ');
    });

    it('takes a full-width slash as division inside a calculated buff', () => {
      character.status.changeValue('HP', 'now', -100);
      const before = character.status.getValue('HP', 'now')!;

      applyBuffEdit({ command: '&!鈍足/HP/-/10／4/2', object: character, targeted: false }, character);

      expect(character.status.getValue('HP', 'now')).toBe(before - 2);
      expect(character.buffs.find('鈍足')!.value).toBe(2);
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

    it('keeps a status held at a value where it is when more is stacked on the buff', () => {
      applyBuffEdit({ command: '&!石化/HP/=/0/1', object: character, targeted: false }, character);

      const stacked = applyBuffEdit({ command: '&+!石化/HP/+/2/3', object: character, targeted: false }, character);
      applyBuffEdit({ command: '&++!石化/HP/+/2/2', object: character, targeted: false }, character);
      applyBuffEdit({ command: '&+石化/HP+2/1', object: character, targeted: false }, character);

      expect(character.status.getValue('HP', 'now')).toBe(0);
      expect(stacked).toBe('石化を加算 HP=0/3R    ');
      expect(character.buffs.find('石化')!.currentValue).toBe('HP=0');
      expect(character.buffs.find('石化')!.value).toBe(5);
    });

    it('lets the hold go and writes the new note where more is stacked on another status', () => {
      const edit = (command: string) => applyBuffEdit({ command, object: character, targeted: false }, character);
      edit('&!石化/HP/=/0/1');

      expect(edit('&+!石化/MP/-/2/3')).toBe('石化を加算 MP-2/3R    ');
      expect([character.status.getValue('HP', 'now'), character.status.getValue('MP', 'now')]).toEqual([200, 98]);
      expect(character.buffs.find('石化')!.currentValue).toBe('MP-2');
    });

    it('keeps the maximum held where more is stacked on that side of the status', () => {
      const edit = (command: string) => applyBuffEdit({ command, object: character, targeted: false }, character);
      edit('&!石化/HP^/=/30/1');
      const held = character.buffs.find('石化')!.currentValue;

      edit('&+!石化/HP^/+/2/3');

      expect(character.status.getValue('HP', 'max')).toBe(30);
      expect(character.buffs.find('石化')!.currentValue).toBe(held);
    });

    it('writes a plain note about another status over a buff holding one, which stays held', () => {
      applyBuffEdit({ command: '&!石化/HP/=/0/1', object: character, targeted: false }, character);

      applyBuffEdit({ command: '&+石化/MP+2/1', object: character, targeted: false }, character);

      expect(character.buffs.find('石化')!.currentValue).toBe('MP+2');
      expect(character.status.getValue('HP', 'now')).toBe(0);
    });

    it('says the held status is missing where it has gone from the sheet before more is stacked', () => {
      applyBuffEdit({ command: '&!石化/MP/=/0/1', object: character, targeted: false }, character);
      character.detailDataElement!.getFirstElementByName('MP')!.destroy();

      const text = applyBuffEdit({ command: '&+!石化/MP/+/2/3', object: character, targeted: false }, character);

      expect(text).toBe('石化を加算 MP=0/3R (MPが見つかりません)    ');
    });

    it('lays a buff of a status moved for whoever aims at the piece as a note, moving nothing and missing nothing', () => {
      const hpBefore = character.status.getValue('HP', 'now');
      const text = applyBuffEdit(
        { command: '&!弱点/相手のHP+2,相手の物理特攻+3/none', object: character, targeted: false },
        character
      );

      expect(text).toBe('弱点を付与 相手のHP+2,相手の物理特攻+3    ');
      expect(character.buffs.find('弱点')!.currentValue).toBe('相手のHP+2');
      expect(character.status.getValue('HP', 'now')).toBe(hpBefore);
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
