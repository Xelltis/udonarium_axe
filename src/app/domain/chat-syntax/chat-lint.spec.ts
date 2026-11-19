import { writeDefault } from '@axe/domain/character/default-value';
import { GameCharacter } from '@axe/domain/character/game-character';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { type ChatLintContext, lintChatSyntax } from '@axe/domain/chat-syntax/chat-lint';
import { scanChatSyntax } from '@axe/domain/chat-syntax/chat-syntax';
import { DataElement } from '@axe/domain/data/data-element';

describe('lintChatSyntax', () => {
  let speaker: GameCharacter;
  let target: GameCharacter;

  beforeEach(() => {
    speaker = GameCharacter.create('戦士', 1, '');
    target = GameCharacter.create('ゴブリン', 1, '');
  });

  afterEach(() => {
    speaker.destroy();
    target.destroy();
  });

  function contextOf(overrides: Partial<ChatLintContext> = {}): ChatLintContext {
    return {
      path: 'chatWindow',
      speaker,
      targets: [],
      isGameMaster: false,
      keptOffTable: false,
      referenceValue: () => null,
      portraits: () => [],
      isChatCutIn: () => false,
      hasEffect: () => false,
      hasPieceNamed: () => false,
      rollCheck: () => null,
      ...overrides,
    };
  }

  function lint(text: string, overrides: Partial<ChatLintContext> = {}) {
    return lintChatSyntax(scanChatSyntax(text), contextOf(overrides));
  }

  function codes(text: string, overrides: Partial<ChatLintContext> = {}): string[] {
    return lint(text, overrides).map((found) => found.code);
  }

  describe('stamps put inside a line', () => {
    it('finds one this version does not know, which is written as its name', () => {
      expect(lint('［新顔:sfx:fromthefuture］')).toEqual([
        expect.objectContaining({ severity: 'info', code: 'stamp.unknown', params: { name: '新顔' } }),
      ]);
    });

    it('finds one the room does not let be sent, and none it does', () => {
      const stampAllowed = (stampId: string) => stampId !== 'seal:ok';
      expect(lint('［了解:seal:ok］［ドッ:sfx:boom］', { stampAllowed })).toEqual([
        expect.objectContaining({ severity: 'warning', code: 'stamp.denied', params: { name: '了解' }, from: 0 }),
      ]);
      expect(codes('［ドッ:sfx:boom］')).toEqual([]);
    });
  });

  describe('rolls', () => {
    it('says what the game system makes of the roll', () => {
      expect(codes('CC<=50', { rollCheck: () => ({ kind: 'plainText' }) })).toEqual(['dice.plainText']);
      expect(codes('2d6>=', { rollCheck: () => ({ kind: 'unrollable' }) })).toEqual(['dice.unrollable']);
      expect(codes('x100 200d6', { rollCheck: () => ({ kind: 'tooMany' }) })).toEqual(['dice.tooMany']);
    });

    it('says nothing while the game system has not answered, or of a roll that rolls', () => {
      expect(codes('2d6')).toEqual([]);
      expect(codes('2d6', { rollCheck: () => ({ kind: 'rolled', result: '7' }) })).toEqual([]);
    });

    it('finds a limit reached through a reference, filled in as the line is rolled', () => {
      const found = lint('{回数}D6', {
        rollCheck: () => ({ kind: 'rolled', result: '7' }),
        rolledText: () => '500D6',
      }).filter((finding) => finding.code.startsWith('dice.'));

      expect(found.map((finding) => [finding.code, finding.from, finding.to])).toEqual([['dice.tooManyDice', 0, 6]]);
    });

    it('places the terms past what the dice library rolls', () => {
      const text = '300d6+2d6';
      const found = lint(text, { rollCheck: () => ({ kind: 'rolled', result: '0' }) });
      expect(found.map((each) => [each.code, text.slice(each.from, each.to)])).toEqual([['dice.tooManyDice', '300d6']]);
    });
  });

  describe('targets', () => {
    it('finds a line aimed at targets with none picked out, which is not sent', () => {
      expect(codes('t:HP-1')).toEqual(['target.none']);
      expect(codes('t{HP}')).toEqual(['target.none']);
      expect(codes('2d6+8 t:')).toEqual(['target.none']);
    });

    it('finds nothing in a palette line aimed at targets with none picked out yet, as they are picked as it is sent', () => {
      const palette = { path: 'palette' as const, sentLater: true, hasEffect: () => true, hasEffectTarget: false };
      expect(codes('t:HP-1', palette)).toEqual([]);
      expect(codes('2d6+t{HP}', palette)).toEqual([]);
      expect(codes('《斬撃》', palette)).toEqual([]);
      expect(codes('《斬撃》', { ...palette, path: 'chatWindow', sentLater: false })).toEqual(['effect.noTarget']);
      expect(codes('t:HP-1', { ...palette, sentLater: false })).toEqual(['target.none']);
    });

    it('checks a command aimed at targets against each of them', () => {
      expect(codes('t:HP-1', { targets: [target] })).toEqual([]);
      expect(lint('t:気力-1', { targets: [target] })[0]).toMatchObject({
        code: 'res.unknownStatus',
        params: { name: '気力', piece: 'ゴブリン' },
      });
    });

    it('names the pieces it finds wanting as the reader is told them', () => {
      const told = { targets: [target], nameOf: () => '？？？' };

      expect(lint('t:気力-1', told)[0]).toMatchObject({ params: { piece: '？？？' } });
      expect(lint('t&加護-', told)[0]).toMatchObject({ code: 'buff.notFound', params: { piece: '？？？' } });
    });
  });

  describe('references', () => {
    it('finds one nothing answers, kept as typed in chat and emptied from a palette', () => {
      expect(lint('{気力}')[0]).toMatchObject({ code: 'ref.unknownKept', params: { name: '気力' } });
      expect(codes('{気力}', { path: 'palette' })).toEqual(['ref.unknownEmptied']);
      expect(codes('2d6+1{加護}')).toEqual(['ref.unknownEmptied']);
      expect(codes('やった{歓喜}')).toEqual(['ref.unknownKept']);
      expect(codes('{HP}', { referenceValue: () => '10' })).toEqual([]);
    });

    it('tells of a number to beat with no roll yet to fill it in, which is kept as typed from a palette too', () => {
      expect(codes('2d6>={目標値}')).toEqual(['ref.targetNumberNone']);
      expect(codes('2d6>={目標値}', { path: 'palette' })).toEqual(['ref.targetNumberNone']);
      expect(codes('2d6>={目標値}', { referenceValue: () => '14' })).toEqual([]);
      expect(codes('2d6>={目標値}', { speaker: null })).toEqual(['ref.targetNumberNone']);
    });

    it('finds one from a speaker who is no piece, which is never filled in from chat', () => {
      expect(codes('{HP}', { speaker: null })).toEqual(['ref.noSpeaker']);
    });

    it('finds one that aims the line at targets through what it is filled in with, as sending does', () => {
      const speakerFilled = (text: string) => text.replace('{攻撃}', '2d6+t{防御}');
      const answered = { speakerFilled, referenceValue: () => '2d6+t{防御}' };

      expect(codes('{攻撃}', answered)).toEqual(['target.none']);
      expect(codes('{攻撃}', { ...answered, path: 'palette', sentLater: true })).toEqual([]);
      expect(codes('{攻撃}', { ...answered, targets: [target] })).toEqual([]);
      const portraits = () => [{ label: '笑顔', identifier: 'id-smile' }];
      expect(codes('{攻撃} @笑顔', { ...answered, portraits, targets: [target] })).toEqual(['portrait.lostByTarget']);
    });
  });

  describe('resource commands', () => {
    it('finds what reading the command into an edit turns down', () => {
      expect(codes(':HP=MAX')).toEqual(['res.badOption']);
      expect(codes(':HP+abc')).toEqual(['res.badOption']);
      expect(codes(':名前メモ=OK')).toEqual([]);
      expect(codes(':HP-5')).toEqual([]);
      expect(codes(':HP')).toEqual(['res.noOperator']);
      expect(codes('ok :) :-) :D')).toEqual([]);
      expect(codes('ok :)', { speaker: null })).toEqual([]);
      expect(codes(':HP-')).toEqual(['res.noAmount']);
      expect(codes(':気力-1')).toEqual(['res.unknownStatus']);
      expect(codes(':HP-5Q')).toEqual(['res.badOption']);
    });

    it('takes words after `=` for a line of text or a choice, and finds words that are none of the choices', () => {
      expect(codes(':名前メモ=炎の剣士')).toEqual([]);
      expect(codes(':役割=交渉役')).toEqual([]);
      expect(codes(':役割>支援役')).toEqual([]);
      expect(codes('：役割＝交渉役')).toEqual([]);
      expect(codes(':役割=1d3')).not.toContain('res.notAChoice');
      expect(codes(':名前メモ=OK')).toEqual([]);
      expect(codes(':役割+1')).not.toContain('res.notAChoice');
      expect(lint(':役割_MAX=交渉役')[0]).toMatchObject({ severity: 'error', code: 'res.noSlot' });
      expect(lint(':役割=5')[0]).toMatchObject({ severity: 'error', code: 'res.notAChoice' });
      expect(codes(':役割=1d3')).toEqual([]);
      expect(codes(':役割^=交渉役')).toEqual([]);
      expect(lint(':役割=勇者')[0]).toMatchObject({
        severity: 'error',
        code: 'res.notAChoice',
        params: { name: '役割', choices: '調査役・交渉役・支援役・記録役' },
      });
    });

    it('says nothing of a name or an amount a reference fills in, which is read only once it is', () => {
      expect(codes(':{対象}-1')).not.toContain('res.unknownStatus');
      expect(codes(':HP-{ダメージ}')).not.toContain('res.badOption');
    });

    it('finds an effect, a battle or a cut-in on a seat watching, which plays none of them', () => {
      expect(codes('攻撃 《ファイア》', { keptOffTable: true, hasEffect: () => true })).toEqual(['edit.keptOffTable']);
      expect(codes('斬る 《vs》', { keptOffTable: true })).toEqual(['edit.keptOffTable']);
      expect(codes('行くぞ 爆発', { keptOffTable: true, isChatCutIn: () => true })).toEqual(['edit.keptOffTable']);
    });

    it('finds a command with nobody to carry it out', () => {
      expect(codes(':HP-5', { speaker: null })).toEqual(['edit.noSpeaker']);
      expect(codes(':HP-5 &加護/3', { keptOffTable: true })).toEqual(['edit.keptOffTable', 'edit.keptOffTable']);
    });
  });

  describe('buff commands', () => {
    it('finds a calculated buff it cannot read, or one moving a status the piece lacks', () => {
      expect(codes('&!猛攻撃/攻撃/+/たくさん/3')).toEqual(['buff.unreadable']);
      expect(lint('&!猛攻撃/気力/+/2/3')[0]).toMatchObject({
        severity: 'info',
        code: 'buff.makesStatus',
        params: { name: '気力' },
      });
      expect(lint('&!毒/:気力/+/0~-3/3')[0]).toMatchObject({ code: 'buff.missingStatus', params: { name: '気力' } });
      expect(codes('&!鼓舞/気力^/+/2/3')).toEqual(['buff.missingStatus']);
      expect(codes('&!猛攻撃/HP/+/2/3')).toEqual([]);
    });

    it('takes a buff writing words into a line of text or a choice, and finds words that are none of the choices', () => {
      expect(codes('&!ファイア・ウェポン/HP+2,名前メモ=炎/18')).toEqual([]);
      expect(codes('&!指揮/役割=交渉役/3')).toEqual([]);
      expect(lint('&!指揮/役割=勇者/3')[0]).toMatchObject({
        severity: 'error',
        code: 'buff.notAChoice',
        params: { name: '役割', choices: '調査役・交渉役・支援役・記録役' },
      });
      expect(codes('&!猛攻撃/名前メモ+2/3')).toEqual(['buff.noNumber']);
    });

    it('finds words a buff would write into an item that holds numbers, and a number that is none of the choices', () => {
      expect(lint('&!呪い/HP=炎/3')[0]).toMatchObject({ severity: 'error', code: 'buff.notWords' });
      expect(lint('&!呪い/HP=1d6/3')[0]).toMatchObject({ severity: 'error', code: 'buff.unreadable' });
      expect(lint('&!指揮/役割=5/3')[0]).toMatchObject({ severity: 'error', code: 'buff.notAChoice' });
    });

    it('tells of an item to be made only where a buff may make one by that name', () => {
      vi.spyOn(speaker.status, 'canMakeForBuff').mockReturnValue(false);

      expect(lint('&!鼓舞/気力+2/3')[0]).toMatchObject({ code: 'buff.missingStatus', params: { name: '気力' } });
    });

    it('says an item nothing is written into is not moved, rather than that one will be made', () => {
      const group = speaker.detailDataElement!.getFirstElementByName('名前メモ')!.parent as DataElement;
      group.appendChild(DataElement.create('状態', '', { type: 'check' }));

      expect(codes('&!X/状態=毒/3')).toEqual(['buff.unwritable']);
    });

    it('finds a value written in that `:` asks to leave once the buff goes', () => {
      expect(lint('&!変化/:名前メモ=3/3')[0]).toMatchObject({ severity: 'error', code: 'buff.lastingWords' });
      expect(codes('&!毒/:HP-1/3')).toEqual([]);
    });

    it('finds the half-width item a buff can move before a full-width one nothing is written into, as laying it does', () => {
      const group = speaker.detailDataElement!.getFirstElementByName('名前メモ')!.parent as DataElement;
      group.appendChild(DataElement.create('ＨＰ', '', { type: 'check' }));

      expect(codes('&!活力/ＨＰ+1/3')).toEqual([]);
    });

    it('tells nothing of the items of a piece kept from the reader, and all of them to one who may see it', () => {
      speaker.disclosureMode = 'gm';

      for (const line of [
        '&!指揮/役割=勇者/3',
        ':役割=勇者',
        ':役割>Fire',
        ':役割=Fire',
        '&!鼓舞/気力+2/3',
        ':気力-1',
      ]) {
        expect(codes(line), line).toEqual([]);
      }
      expect(codes(':役割=勇者', { mayView: () => true })).toEqual(['res.notAChoice']);
      expect(codes(':役割>Fire', { mayView: () => true })).toEqual(['res.notAChoice']);
      expect(codes('&!鼓舞/気力+2/3', { mayView: () => true })).toEqual(['buff.makesStatus']);
      expect(codes(':HP-5Q')).toEqual([]);
      expect(codes(':HP-5Q', { mayView: () => true })).toEqual(['res.badOption']);
    });

    it('finds words that are none of the choices for one target though another lacks the item', () => {
      const lacking = GameCharacter.create('スライム', 1, '');
      lacking.detailDataElement!.getFirstElementByName('役割')!.destroy();
      try {
        expect(codes('t&!指揮/役割=勇者/3', { targets: [lacking, target] })).toContain('buff.notAChoice');
      } finally {
        lacking.destroy();
      }
    });

    it("says nothing of a status a buff moves for whoever aims at the piece, which is none of the piece's own", () => {
      expect(codes('&!弱点/相手の物理特攻+2/none')).toEqual([]);
      expect(codes('&!弱点/相手の物理特攻/+/2/none')).toEqual([]);
    });

    it('finds a moment for the effect that cannot be read, which the buff is laid without', () => {
      expect(codes('&!再生/:HP/+/0~+3/none/発生:いつか')).toEqual(['buff.badEffectTiming']);
      expect(codes('&!再生/:HP/+/0~+3/none/tick:none')).toEqual(['buff.badEffectTiming']);
      expect(codes('&再生/回復/3/発生:いつか')).toEqual(['buff.badEffectTiming']);
    });

    it('says a moment for the effect is not used where nothing moves at every count', () => {
      expect(codes('&!猛攻撃/HP/+/2/3/発生:手番開始')).toEqual(['buff.idleEffectTiming']);
      expect(codes('&!留める/HP/=/5/3/発生:手番開始')).toEqual(['buff.idleEffectTiming']);
      expect(codes('&加護/防御+2/3/発生:手番開始')).toEqual(['buff.idleEffectTiming']);
    });

    it('says nothing of a moment for an effect that moves at every count', () => {
      expect(codes('&!再生/:HP/+/0~+3/none/発生:手番開始')).toEqual([]);
      expect(codes('&!再生/:HP/+/0~+3/3/@術者/発生:手番終了')).toEqual([]);
      expect(codes('&!猛攻撃/HP/++/1/3/tick:turnEnd')).toEqual([]);
      expect(codes('&!再生/:HP+0~+3/発生:ラウンド終了')).toEqual([]);
    });

    it('finds a buff to take off that the piece does not have', () => {
      expect(codes('&加護-')).toEqual(['buff.notFound']);
      expect(codes('＆加護－')).toEqual(['buff.notFound']);
      speaker.addExtendData();
      speaker.buffs.addRound('加護', '', 3);
      expect(codes('&加護-')).toEqual([]);
    });

    it('says nothing of a buff or a status a reference names, which is read only once it is filled in', () => {
      expect(codes('&{バフ}-')).not.toContain('buff.notFound');
      expect(codes('&!強化/{能力}/+/2/3')).not.toContain('buff.missingStatus');
    });

    it('says rounds that are no number last three', () => {
      expect(codes('&加護/防御+2/ずっと')).toEqual(['buff.roundsDefault']);
    });

    it('says nothing of three rounds where a timing stands in their place', () => {
      expect(codes('&加護/防御+2/none')).toEqual([]);
    });

    it('says nothing of three rounds for a buff named after a state the room keeps, which lasts the state’s', () => {
      StatusAilmentCatalog.instance.ailments = [{ ...newStatusAilment('毒'), rounds: 5 }];
      try {
        expect(codes('&毒/2d6/ずっと')).toEqual([]);
        expect(codes('&加護/2d6/ずっと')).toEqual(['buff.roundsDefault']);
      } finally {
        StatusAilmentCatalog.instance.ailments = [];
      }
    });

    it('reads the rounds of a buff written with its status, mark and amount apart where they stand after them', () => {
      expect(codes('&加護/防御/+/2/3')).toEqual([]);
      expect(codes('&加護/防御/+/2/ずっと')).toEqual(['buff.roundsDefault']);
    });

    it('finds a sweep by anyone but the game master', () => {
      expect(codes('&&毒-')).toEqual(['sweep.gmOnly']);
      expect(codes('&&毒-', { isGameMaster: true })).toEqual([]);
    });
  });

  describe('resets', () => {
    const hpOf = (piece: GameCharacter) => piece.detailDataElement!.getFirstElementByName('HP')!;

    it('says nothing of a clearing of buffs, which names no buff to be found', () => {
      for (const line of ['&*-', '&*バフ-', '&*debuff-', '＆＊－']) expect(codes(line), line).toEqual([]);
      expect(codes('t&*-', { targets: [target] })).toEqual([]);
    });

    it('finds one aimed at no target, one from a seat that only watches and one said as no piece', () => {
      for (const line of ['t&*-', 't:*=既定', 't&リセット-']) expect(codes(line), line).toEqual(['target.none']);
      for (const line of ['&*-', ':*=既定', '&リセット-', '&&*-', '&&リセット-']) {
        expect(codes(line, { keptOffTable: true }), line).toEqual(['edit.keptOffTable']);
      }
      for (const line of ['&*-', ':*=既定', ':HP=既定', '&リセット-']) {
        expect(codes(line, { speaker: null }), line).toEqual(['edit.noSpeaker']);
      }
      expect(codes('t&リセット-', { sentLater: true })).toEqual([]);
    });

    it('finds one across the table by anyone but the game master', () => {
      expect(lint('&&リセット-')).toEqual([expect.objectContaining({ severity: 'error', code: 'reset.gmOnly' })]);
      expect(codes('s&&reset-')).toEqual(['reset.gmOnly']);
      expect(codes('&&*-')).toEqual(['sweep.gmOnly']);
      expect(codes('&&*デバフ-')).toEqual(['sweep.gmOnly']);
      expect(codes('&&*-', { isGameMaster: true })).toEqual([]);
      expect(codes('&&リセット-', { isGameMaster: true })).toEqual([]);
    });

    it('finds values put back where nothing keeps a default, a warning where that is all the command does', () => {
      expect(lint(':*=既定')).toEqual([expect.objectContaining({ severity: 'warning', code: 'reset.noDefaults' })]);
      expect(lint('&リセット-')).toEqual([expect.objectContaining({ severity: 'info', code: 'reset.noDefaults' })]);
      expect(codes(':HP=既定')).toEqual(['reset.noDefaults']);
      expect(codes('t:*=既定', { targets: [target] })).toEqual(['reset.noDefaults']);

      writeDefault(hpOf(speaker), 'now', 100);

      expect(codes(':*=既定')).toEqual([]);
      expect(codes('&リセット-')).toEqual([]);
      expect(codes(':HP=default')).toEqual([]);
      expect(codes(':HP^=既定')).toEqual(['reset.noDefaults']);
      expect(codes('t:*=既定', { targets: [target, speaker] })).toEqual([]);
    });

    it('finds an item named that a piece has not, as for any change of one', () => {
      expect(lint(':魔力=既定')[0]).toMatchObject({
        code: 'res.unknownStatus',
        params: { name: '魔力', piece: '戦士' },
      });
      expect(codes(':{項目}=既定')).toEqual(['ref.unknownKept']);
    });

    it('finds values put back across a table where nothing keeps a default, where the table is told', () => {
      const piecesOnTable = () => [speaker, target];
      expect(lint('&&リセット-', { isGameMaster: true, piecesOnTable })).toEqual([
        expect.objectContaining({ severity: 'info', code: 'reset.noDefaults' }),
      ]);

      writeDefault(hpOf(target), 'max', 100);

      expect(codes('&&リセット-', { isGameMaster: true, piecesOnTable })).toEqual([]);
    });

    it('finds a buff going by the very name the command is written with, which it no longer takes off by name', () => {
      writeDefault(hpOf(speaker), 'now', 100);
      speaker.buffs.addRound('リセット', '', 3);
      speaker.buffs.addRound('*', '', 3);
      target.buffs.addRound('*バフ', '', 3);

      expect(lint('&リセット-')).toEqual([
        expect.objectContaining({ severity: 'info', code: 'reset.shadowsBuff', params: { name: 'リセット' } }),
      ]);
      expect(lint('&*-')[0]).toMatchObject({ code: 'reset.shadowsBuff', params: { name: '*' } });
      expect(codes('&reset-')).toEqual([]);
      expect(codes('t&*バフ-', { targets: [target] })).toEqual(['reset.shadowsBuff']);
      expect(codes('&&*-', { isGameMaster: true, piecesOnTable: () => [speaker] })).toEqual(['reset.shadowsBuff']);
      expect(codes(':*=既定')).toEqual([]);
    });

    it('finds in the words written before what it found', () => {
      expect(codes('&加護-')).toEqual(['buff.notFound']);
      expect(codes('&*毒-')).toEqual(['buff.notFound']);
      expect(codes('&D')).toEqual([]);
      expect(codes('&&none-')).toEqual(['sweep.gmOnly']);
      expect(codes('&&*毒-')).toEqual(['sweep.gmOnly']);
      expect(codes(':HP=10')).toEqual([]);
      expect(codes(':魔力=10')).toEqual(['res.unknownStatus']);
      expect(codes('&T')).toEqual(['turn.take']);
      expect(codes('**強く')).toEqual(['deco.unpaired']);
    });

    it('says nothing of three rounds for a buff with a word marking it a debuff where its rounds go', () => {
      expect(codes('&毒霧/命中-2/デバフ')).toEqual([]);
      expect(codes('&毒霧/命中-2/デバフ中')).toEqual(['buff.roundsDefault']);
    });
  });

  describe('round commands', () => {
    it('says what each command does where the speaker may use it', () => {
      expect(lint('&T')).toEqual([expect.objectContaining({ severity: 'info', code: 'turn.take', from: 0, to: 2 })]);
      expect(codes('&手番終了')).toEqual(['turn.end']);
      expect(codes('&TW')).toEqual(['turn.wait']);
      expect(codes('&TI')).toEqual(['turn.stepIn']);
      expect(codes('&TB')).toEqual(['turn.back']);
      expect(codes('&RS')).toEqual(['turn.roundStart']);
      expect(codes('&RN')).toEqual(['turn.roundNext']);
      expect(codes('&RB')).toEqual(['turn.roundBack']);
      expect(codes('&RR')).toEqual(['turn.roundReset']);
    });

    it('finds one the speaker may not use, or that would move nothing now, with why', () => {
      const asked: string[] = [];
      const turnCommandRefusal = (command: string) => {
        asked.push(command);
        return 'watching' as const;
      };

      expect(lint('&RS', { turnCommandRefusal })).toEqual([
        expect.objectContaining({ severity: 'error', code: 'turn.no.watching', from: 0, to: 3 }),
      ]);
      expect(asked).toEqual(['roundStart']);
      expect(codes('&T', { turnCommandRefusal: () => 'otherSide' })).toEqual(['turn.no.otherSide']);
    });

    it('finds no fault that turns on where the round stands in a line written to be sent later', () => {
      expect(codes('&T', { sentLater: true, turnCommandRefusal: () => 'otherSide' })).toEqual(['turn.take']);
    });

    it('checks the rest of the line as a line of its own', () => {
      const checked: string[] = [];
      const rollCheck = (message: { from: number; to: number }) => {
        checked.push('&T 2d6>= 攻撃'.slice(message.from, message.to));
        return { kind: 'unrollable' } as const;
      };

      expect(codes('&T 2d6>= 攻撃', { rollCheck })).toEqual(['turn.take', 'dice.unrollable']);
      expect(checked).toEqual(['2d6>= 攻撃']);
    });

    it('says nothing of a buff named as a command is, nor of the word in the middle of a line', () => {
      expect(codes('&RS/効果/3')).toEqual([]);
      expect(codes('攻撃 &加護/防御+1/3')).toEqual([]);
    });
  });

  describe('portraits and cut-ins', () => {
    const portraits = () => [
      { label: '通常', identifier: 'id-normal' },
      { label: '笑顔', identifier: 'id-smile' },
    ];

    it('finds a portrait the speaker does not have', () => {
      expect(codes('やあ @笑顔', { portraits })).toEqual([]);
      expect(codes('やあ @2', { portraits })).toEqual([]);
      expect(codes('やあ @怒り', { portraits })).toEqual(['portrait.unknown']);
      expect(codes('やあ @hide')).toEqual([]);
    });

    it('says nothing of an at mark no portrait answers that plays a cut-in’s sound', () => {
      expect(codes('やあ @爆発', { portraits, isChatCutIn: (name) => name === '爆発' })).toEqual([]);
    });

    it('finds a portrait or cut-in on a line aimed at targets, which ends with their name', () => {
      expect(codes('t:HP-1 @笑顔', { portraits, targets: [target] })).toEqual(['portrait.lostByTarget']);
      expect(codes('t:HP-1 爆発', { targets: [target], isChatCutIn: () => true })).toEqual(['cutIn.lostByTarget']);
    });

    it('says a cut-in on a secret line does not start', () => {
      expect(codes('s:HP-1 爆発', { isChatCutIn: (name) => name === '爆発' })).toEqual(['cutIn.secret']);
      expect(codes('S2d6 爆発', { isChatCutIn: () => true, secretRoll: () => true })).toEqual(['cutIn.secret']);
      expect(codes('S2d6 爆発', { isChatCutIn: () => true, secretRoll: () => false })).toEqual([]);
    });

    it('says nothing of a last word no cut-in is named', () => {
      expect(codes('s:HP-1 こんにちは')).toEqual([]);
    });
  });

  describe('effect and dice tokens', () => {
    it('finds an empty token, which stops the reading, an effect not in the library, and one after the first', () => {
      expect(codes('《 》《爆炎》')).toEqual(['effect.blank']);
      expect(codes('《爆炎》《 》')).toEqual(['effect.unknown', 'effect.blank']);
      expect(codes('《爆炎》《雷》', { hasEffect: () => true })).toEqual(['effect.extra']);
    });

    it('finds an effect with no piece targeted or selected to play on, but not in a line aimed at targets', () => {
      const known = { hasEffect: () => true };
      expect(lint('《爆炎》', { ...known, hasEffectTarget: false })).toEqual([
        expect.objectContaining({ code: 'effect.noTarget', severity: 'warning', params: { name: '爆炎' } }),
      ]);
      expect(codes('《爆炎》', { ...known, hasEffectTarget: true })).toEqual([]);
      expect(codes('t:HP-1 《爆炎》', { ...known, hasEffectTarget: false })).not.toContain('effect.noTarget');
    });

    it('finds a battle with nobody to strike, the speaker being a piece', () => {
      expect(codes('《vs》', { hasEffectTarget: false, hasBattleDefender: false })).toEqual(['battle.noTarget']);
      expect(codes('《vs》', { hasEffectTarget: true, hasBattleDefender: true })).toEqual([]);
      expect(codes('《vs》', { hasEffectTarget: true, hasBattleDefender: false })).toEqual(['battle.noTarget']);
    });

    it('finds dice on a piece that is not there', () => {
      expect(lint('2d6 dice:オーク')[0]).toMatchObject({ code: 'diceToken.unknown', params: { name: 'オーク' } });
      expect(codes('2d6 dice:', {})).toEqual([]);
    });
  });

  describe('decorations and staging', () => {
    it('finds a mark left unpaired', () => {
      const [found] = lint('**強く\n次');
      expect(found).toMatchObject({ code: 'deco.unpaired', from: 0, to: 2 });
    });

    it('finds a decoration round a roll or a change, which keeps it from being read as one', () => {
      expect(codes('**2d6 攻撃**')).toContain('deco.hidesCommand');
      expect(codes('ab **:HP-1**')).toContain('deco.hidesCommand');
      expect(codes('2d6 **攻撃**')).not.toContain('deco.hidesCommand');
      expect(codes('**こんにちは** 1d6')).not.toContain('deco.hidesCommand');
      expect(codes('**Hello1** there')).not.toContain('deco.hidesCommand');
      expect(codes('**2d6**［笑:seal:ok］')).toContain('deco.hidesCommand');
    });

    it('names the words that give a staging bracket up', () => {
      expect(lint('メモ 〔叫び・重要〕')[0]).toMatchObject({ code: 'vn.dropped', params: { words: '重要' } });
      expect(codes('〔叫び・もやもや〕')).toEqual(['vn.duplicate']);
    });
  });

  it('checks each line of a palette as a message of its own', () => {
    const text = '//x=1\n:気力-1\n:HP-1';
    const found = lintChatSyntax(scanChatSyntax(text, 'palette'), contextOf({ path: 'palette' }));
    expect(found.map((each) => [each.code, text.slice(each.from, each.to)])).toEqual([
      ['res.unknownStatus', ':気力-1'],
    ]);
  });
});
