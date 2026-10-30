import { GameCharacter } from '@axe/domain/character/game-character';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { type ChatLintContext, lintChatSyntax } from '@axe/domain/chat-syntax/chat-lint';
import { scanChatSyntax } from '@axe/domain/chat-syntax/chat-syntax';

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
  });

  describe('references', () => {
    it('finds one nothing answers, kept as typed in chat and emptied from a palette', () => {
      expect(lint('{気力}')[0]).toMatchObject({ code: 'ref.unknownKept', params: { name: '気力' } });
      expect(codes('{気力}', { path: 'palette' })).toEqual(['ref.unknownEmptied']);
      expect(codes('{HP}', { referenceValue: () => '10' })).toEqual([]);
    });

    it('finds one from a speaker who is no piece, which is never filled in from chat', () => {
      expect(codes('{HP}', { speaker: null })).toEqual(['ref.noSpeaker']);
    });
  });

  describe('resource commands', () => {
    it('finds what reading the command into an edit turns down', () => {
      expect(codes(':HP-5')).toEqual([]);
      expect(codes(':HP')).toEqual(['res.noOperator']);
      expect(codes('ok :) :-) :D')).toEqual([]);
      expect(codes('ok :)', { speaker: null })).toEqual([]);
      expect(codes(':HP-')).toEqual(['res.noAmount']);
      expect(codes(':気力-1')).toEqual(['res.unknownStatus']);
      expect(codes(':HP-5Q')).toEqual(['res.badOption']);
    });

    it('finds a command with nobody to carry it out', () => {
      expect(codes(':HP-5', { speaker: null })).toEqual(['edit.noSpeaker']);
      expect(codes(':HP-5 &加護/3', { keptOffTable: true })).toEqual(['edit.keptOffTable', 'edit.keptOffTable']);
    });
  });

  describe('buff commands', () => {
    it('finds a calculated buff it cannot read, or one moving a status the piece lacks', () => {
      expect(codes('&!猛攻撃/攻撃/+/たくさん/3')).toEqual(['buff.unreadable']);
      expect(lint('&!猛攻撃/気力/+/2/3')[0]).toMatchObject({ code: 'buff.missingStatus', params: { name: '気力' } });
      expect(codes('&!猛攻撃/HP/+/2/3')).toEqual([]);
    });

    it('finds a buff to take off that the piece does not have', () => {
      expect(codes('&加護-')).toEqual(['buff.notFound']);
      expect(codes('＆加護－')).toEqual(['buff.notFound']);
      speaker.addExtendData();
      speaker.buffs.addRound('加護', '', 3);
      expect(codes('&加護-')).toEqual([]);
    });

    it('says rounds that are no number last three', () => {
      expect(codes('&加護/防御+2/ずっと')).toEqual(['buff.roundsDefault']);
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
      expect(codes('《vs》', { hasEffectTarget: false })).toEqual(['battle.noTarget']);
      expect(codes('《vs》', { hasEffectTarget: true })).toEqual([]);
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
