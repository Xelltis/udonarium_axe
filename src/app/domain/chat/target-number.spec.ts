import { TestBed } from '@angular/core/testing';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { fillTargetNumber, findTargetNumber, holdsTargetNumber, rollTotalOf } from '@axe/domain/chat/target-number';

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

    function roll(by: { identifier: string; name: string }, result: string, extra: { tag?: string } = {}): void {
      at += 10;
      tab.addMessage({
        from: `user-${by.identifier}`,
        sendFrom: by.identifier,
        name: by.name,
        text: '2d6',
        timestamp: at,
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

    it('finds the speaker by the name a room server writes after its answer', () => {
      roll(enemy, 'DiceBot : (2D6+5) → 9[4,5]+5 → 14 [騎士［見習い］]');

      expect(findTargetNumber(tab, { identifier: 'pc3', name: '騎士[見習い]' })).toBe(14);
    });

    it('passes over a secret roll, and answers null where nothing is left', () => {
      roll(enemy, 'DiceBot : (2D6+5) → 9[4,5]+5 → 14 [PC1]', { tag: 'system secret' });

      expect(findTargetNumber(tab, speaker)).toBeNull();
    });
  });
});
