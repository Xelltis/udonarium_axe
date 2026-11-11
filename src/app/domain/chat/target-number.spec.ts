import { TestBed } from '@angular/core/testing';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import {
  fillTargetNumber,
  findTargetNumber,
  findTargetNumberSource,
  holdsTargetNumber,
  mayPinTargetNumber,
  presentedTotalOf,
  rolledOf,
  rollerOf,
  rollTotalOf,
  targetNumberChoices,
} from '@axe/domain/chat/target-number';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { beMyself } from '@axe/testing/peer-context-stub';

describe('target-number', () => {
  describe('rollTotalOf()', () => {
    it('reads the last number the arrows lead to', () => {
      expect(rollTotalOf('SW2.5 : (2D6+5) → 9[4,5]+5 → 14')).toBe(14);
      expect(rollTotalOf('SW2.5 : KeyNo.20c[10]+5\n→ 2D:[3,4]=7\n→ 5+5\n→ 10')).toBe(10);
    });

    it('passes over what a check says it came to after the number', () => {
      expect(rollTotalOf('DiceBot : (2D6+5>=14) → 9[4,5]+5 → 14 → 成功')).toBe(14);
      expect(rollTotalOf('Cthulhu7th : (1D100<=50) → 23 → レギュラー成功')).toBe(23);
    });

    it('takes off the name of whoever it was rolled at first', () => {
      expect(rollTotalOf('DiceBot : (2D6+5) → 9[4,5]+5 → 14 [PC1]')).toBe(14);
      expect(rollTotalOf('DiceBot : (2D6-8) → 3[1,2]-8 → -5 [ゴブリン［A］]')).toBe(-5);
    });

    it('answers null for an answer that comes to no number', () => {
      expect(rollTotalOf('DiceBot : (choice[a,b]) → b')).toBeNull();
      expect(rollTotalOf('2d6')).toBeNull();
    });
  });

  describe('presentedTotalOf()', () => {
    it('reads the number written after the word, after a colon, an equals sign or a は, in either width', () => {
      expect(presentedTotalOf('探索判定：目標値13')).toBe(13);
      expect(presentedTotalOf('目標値: 9 で振ってください')).toBe(9);
      expect(presentedTotalOf('目標値は１５')).toBe(15);
      expect(presentedTotalOf('見識判定 目標値＝12、目標値12以上で成功')).toBe(12);
    });

    it('reads none from a reference to the number, a word with no number after it, or two different numbers', () => {
      expect(presentedTotalOf('2d6>={目標値} 抵抗')).toBeNull();
      expect(presentedTotalOf('目標値を教えてください')).toBeNull();
      expect(presentedTotalOf('探索は目標値13、見識は目標値15')).toBeNull();
    });
  });

  describe('fillTargetNumber()', () => {
    it('fills each reference in either width, leaving one read from the target', () => {
      expect(fillTargetNumber('2d+7>={目標値} ｛ 目標値 ｝ t{目標値}', () => 14)).toBe('2d+7>=14 14 t{目標値}');
    });

    it('leaves the line as typed where nothing has been rolled to beat', () => {
      expect(fillTargetNumber('2d+7>={目標値}', () => null)).toBe('2d+7>={目標値}');
    });

    it('asks for the number only where the line holds the reference', () => {
      const total = vi.fn(() => 14);

      expect(fillTargetNumber('2d+7>=12', total)).toBe('2d+7>=12');
      expect(total).not.toHaveBeenCalled();
      expect(holdsTargetNumber('2d+7>={目標値}')).toBe(true);
    });
  });

  describe('findTargetNumber()', () => {
    let tab: ChatTab;
    let at: number;
    const speaker = { identifier: 'pc1', name: 'PC1' };

    beforeEach(() => {
      TestBed.configureTestingModule({});
      tab = new ChatTab();
      tab.initialize();
      at = 1000;
    });

    afterEach(() => {
      tab.destroy();
    });

    function roll(
      by: { identifier: string; name: string },
      result: string,
      extra: { tag?: string; answers?: boolean; together?: string[] } = {}
    ): void {
      at += 10;
      tab.addMessage({
        from: `user-${by.identifier}`,
        sendFrom: by.identifier,
        name: by.name,
        text: '2d6',
        timestamp: at,
        ...(extra.answers ? { answersTargetNumber: '1' } : {}),
        ...(extra.together ? { aimedTogether: JSON.stringify(extra.together) } : {}),
      });
      tab.addMessage({
        from: 'System-BCDice',
        originFrom: `user-${by.identifier}`,
        name: `<BCDice：${by.name}>`,
        text: result,
        tag: extra.tag ?? 'system',
        timestamp: at + 1,
      });
    }

    const enemy = { identifier: 'enemy', name: 'ゴブリン' };

    it('takes the newest roll aimed at the speaker, over a newer one aimed at nobody', () => {
      roll(enemy, 'DiceBot : (2D6+5) → 9[4,5]+5 → 14 [PC1]');
      roll(enemy, 'DiceBot : (2D6+5) → 7[3,4]+5 → 12 [PC2]');
      roll(enemy, 'DiceBot : (1D6) → 3');

      expect(findTargetNumber(tab, speaker)).toBe(14);
      expect(findTargetNumber(tab, { identifier: 'pc2', name: 'PC2' })).toBe(12);
    });

    it('takes the newest roll aimed at nobody by somebody else where none is aimed at the speaker', () => {
      roll(enemy, 'DiceBot : (2D6+5) → 7[3,4]+5 → 12');
      roll(speaker, 'DiceBot : (2D6+7) → 6[3,3]+7 → 13');

      expect(findTargetNumber(tab, speaker)).toBe(12);
    });

    it('passes over a roll aimed at somebody else', () => {
      roll(enemy, 'DiceBot : (2D6+5) → 7[3,4]+5 → 12');
      roll(enemy, 'DiceBot : (2D6+5) → 9[4,5]+5 → 14 [PC2]');

      expect(findTargetNumber(tab, speaker)).toBe(12);
    });

    it('takes a roll aimed at the speaker among everyone it was aimed at all at once, whatever names fitted after it', () => {
      roll(enemy, 'DiceBot : (2D6+8) → 7[3,4]+8 → 15 [PC2、…]', { together: ['pc2', 'pc1', 'pc3'] });
      roll(enemy, 'DiceBot : (1D6) → 3');

      expect(findTargetNumber(tab, speaker)).toBe(15);
      expect(findTargetNumber(tab, { identifier: 'pc3', name: 'ゴブリン、弓兵' })).toBe(15);
      expect(findTargetNumber(tab, { identifier: 'pc4', name: 'PC2' })).toBe(3);
    });

    it('reads a roll at a piece whose name holds a comma as rolled at that piece alone', () => {
      roll(enemy, 'DiceBot : (2D6+5) → 9[4,5]+5 → 14 [ゴブリン、弓兵]');
      roll(enemy, 'DiceBot : (1D6) → 3');

      expect(findTargetNumber(tab, { identifier: 'archer', name: '弓兵' })).toBe(3);
      expect(findTargetNumber(tab, { identifier: 'goblin-archer', name: 'ゴブリン、弓兵' })).toBe(14);
    });

    it('reads a list of those aimed at all at once that cannot be read as aimed at nobody in it', () => {
      roll(enemy, 'DiceBot : (2D6+8) → 7[3,4]+8 → 15 [PC1、PC2]');
      tab.chatMessages[tab.chatMessages.length - 2].aimedTogether = '{broken';

      expect(findTargetNumber(tab, { identifier: 'pc2', name: 'PC2' })).toBeNull();
    });

    it('finds the speaker by the name a room server writes after its answer', () => {
      roll(enemy, 'DiceBot : (2D6+5) → 9[4,5]+5 → 14 [騎士［見習い］]');

      expect(findTargetNumber(tab, { identifier: 'pc3', name: '騎士[見習い]' })).toBe(14);
    });

    it('passes over a roll made to beat a number of its own, as one resisting what was cast at everyone does', () => {
      const caster = { identifier: 'caster', name: '魔法使い' };
      const first = { identifier: 'goblin1', name: 'ゴブリンA' };
      roll(caster, 'DiceBot : (2D6+8) → 7[3,4]+8 → 15');
      roll(first, 'DiceBot : (2D6+3>=15) → 9[4,5]+3 → 12 → 失敗', { answers: true });

      expect(findTargetNumber(tab, { identifier: 'goblin2', name: 'ゴブリンB' })).toBe(15);
    });

    it('still takes a roll aimed at the speaker, made to beat a number of its own', () => {
      roll(enemy, 'DiceBot : (2D6+5) → 9[4,5]+5 → 14 [PC1]', { answers: true });

      expect(findTargetNumber(tab, speaker)).toBe(14);
    });

    /** The answer last added to the tab. */
    const lastAnswer = () => tab.chatMessages[tab.chatMessages.length - 1];

    /** Says a line, as a seat of a role said it, or as a room that never wrote down roles. */
    function say(by: { identifier: string; name: string }, text: string, role?: PeerRole): void {
      at += 10;
      tab.addMessage({
        from: `user-${by.identifier}`,
        sendFrom: by.identifier,
        name: by.name,
        text,
        timestamp: at,
        ...(role ? { senderRole: role } : {}),
      });
    }

    const master = { identifier: 'gm', name: 'GM' };

    it('takes the number a game master wrote out, or the newest roll at nobody, whichever came last', () => {
      roll(enemy, 'DiceBot : (2D6+8) → 7[3,4]+8 → 15');
      say(master, '探索判定：目標値13', PeerRole.GameMaster);

      expect(findTargetNumberSource(tab, speaker)).toMatchObject({ total: 13, from: 'presented' });

      roll(enemy, 'DiceBot : (1D6) → 3');
      expect(findTargetNumberSource(tab, speaker)).toMatchObject({ total: 3, from: 'byOthers' });
    });

    it('still takes a roll aimed at the speaker over a number a game master wrote out after it', () => {
      roll(enemy, 'DiceBot : (2D6+5) → 9[4,5]+5 → 14 [PC1]');
      say(master, '目標値13', PeerRole.GameMaster);

      expect(findTargetNumber(tab, speaker)).toBe(14);
    });

    it('passes over a number written out by a player, by the speaker or in a room that wrote down no roles', () => {
      roll(enemy, 'DiceBot : (2D6+8) → 7[3,4]+8 → 15');
      say({ identifier: 'pc2', name: 'PC2' }, '目標値13だっけ？', PeerRole.Player);
      say(speaker, '目標値12', PeerRole.GameMaster);
      say(master, '目標値11');

      expect(findTargetNumber(tab, speaker)).toBe(15);
    });

    it("takes a number a player wrote out once it is set as the tab's number to beat", () => {
      say({ identifier: 'pc2', name: 'PC2' }, '探索判定：目標値13', PeerRole.Player);
      tab.pinnedTargetNumber = lastAnswer().identifier;
      roll(enemy, 'DiceBot : (1D6) → 3');

      expect(findTargetNumberSource(tab, speaker)).toMatchObject({ total: 13, from: 'pinned' });
      expect(targetNumberChoices(tab, 5).map((choice) => choice.total)).toEqual([3, 13]);
    });

    it("takes the answer set as the tab's number to beat over any newer roll at nobody and any older one at the speaker", () => {
      roll(enemy, 'DiceBot : (2D6+5) → 9[4,5]+5 → 14 [PC1]');
      roll(enemy, 'DiceBot : (2D6+8) → 7[3,4]+8 → 15');
      tab.pinnedTargetNumber = lastAnswer().identifier;
      roll(enemy, 'DiceBot : (1D6) → 3');

      expect(findTargetNumber(tab, speaker)).toBe(15);
      expect(findTargetNumberSource(tab, speaker)?.from).toBe('pinned');
    });

    it("still takes a roll at the speaker newer than the answer set as the tab's number to beat", () => {
      roll(enemy, 'DiceBot : (2D6+8) → 7[3,4]+8 → 15');
      tab.pinnedTargetNumber = lastAnswer().identifier;
      roll(enemy, 'DiceBot : (2D6+5) → 9[4,5]+5 → 14 [PC1]');

      expect(findTargetNumber(tab, speaker)).toBe(14);
    });

    it("goes on as before where the answer set as the tab's number to beat is not in it", () => {
      roll(enemy, 'DiceBot : (2D6+8) → 7[3,4]+8 → 15');
      tab.pinnedTargetNumber = 'gone';

      expect(findTargetNumberSource(tab, speaker)).toMatchObject({ total: 15, from: 'byOthers' });
    });

    it('passes over a secret roll, and answers null where nothing is left', () => {
      roll(enemy, 'DiceBot : (2D6+5) → 9[4,5]+5 → 14 [PC1]', { tag: 'system secret' });

      expect(findTargetNumber(tab, speaker)).toBeNull();
    });

    describe('targetNumberChoices()', () => {
      it('lists the newest answers that come to a number, newest first and no more than asked for', () => {
        roll(enemy, 'DiceBot : (2D6+5) → 9[4,5]+5 → 14 [PC1]');
        roll(enemy, 'DiceBot : (choice[a,b]) → b');
        roll(enemy, 'DiceBot : (2D6+8) → 7[3,4]+8 → 15');
        roll(speaker, 'DiceBot : (2D6+3>=15) → 9[4,5]+3 → 12 → 失敗', { answers: true });

        expect(targetNumberChoices(tab, 2).map((choice) => choice.total)).toEqual([12, 15]);
        expect(targetNumberChoices(tab, 5).map((choice) => choice.total)).toEqual([12, 15, 14]);
      });

      it('passes over a secret roll and the lines said', () => {
        roll(enemy, 'DiceBot : (2D6+5) → 9[4,5]+5 → 14', { tag: 'system secret' });

        expect(targetNumberChoices(tab, 5)).toEqual([]);
      });

      it('passes over a roll whispered, even one the reader rolled, which is not for everyone to beat', () => {
        const me = beMyself();
        roll(enemy, 'DiceBot : (2D6+5) → 9[4,5]+5 → 14');
        lastAnswer().to = 'someone-else';
        lastAnswer().originFrom = me.userId;

        expect(lastAnswer().isDirect && lastAnswer().isDisplayable).toBe(true);
        expect(targetNumberChoices(tab, 5)).toEqual([]);
      });
    });

    describe('mayPinTargetNumber()', () => {
      it('lets anyone but a guest set it, in a tab they may speak in', () => {
        expect(mayPinTargetNumber(tab, PeerRole.GameMaster)).toBe(true);
        expect(mayPinTargetNumber(tab, PeerRole.Player)).toBe(true);
        expect(mayPinTargetNumber(tab, PeerRole.Guest)).toBe(false);

        tab.plCanSpeak = false;

        expect(mayPinTargetNumber(tab, PeerRole.Player)).toBe(false);
        expect(mayPinTargetNumber(tab, PeerRole.GameMaster)).toBe(true);
      });
    });

    describe('rollerOf() and rolledOf()', () => {
      it('reads who rolled an answer and what was rolled from how the dice bot wrote it', () => {
        roll(enemy, 'DiceBot : (2D6+5) → 9[4,5]+5 → 14 [PC1]');

        expect(rollerOf(lastAnswer())).toBe('ゴブリン');
        expect(rolledOf(lastAnswer())).toBe('2D6+5');
      });

      it('answers the name as it is, and no roll, where the answer says neither', () => {
        at += 10;
        tab.addMessage({ from: 'System-BCDice', name: 'ダイス表', text: 'SW2.5 : KeyNo.20c[10]\n→ 10', timestamp: at });

        expect(rollerOf(lastAnswer())).toBe('ダイス表');
        expect(rolledOf(lastAnswer())).toBe('');
      });
    });
  });
});
