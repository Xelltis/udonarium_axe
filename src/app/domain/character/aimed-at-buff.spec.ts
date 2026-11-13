import { aimedAtBonusesOf, isAimedAtStatus } from '@axe/domain/character/aimed-at-buff';
import { DataElement, DataElementType } from '@axe/domain/data/data-element';

describe('aimed-at-buff', () => {
  const buff = (note: string) =>
    DataElement.create('バフ', 3, { type: DataElementType.NUMBER_RESOURCE, currentValue: note });

  describe('isAimedAtStatus()', () => {
    it('reads a status marked 相手の with a name after the mark', () => {
      expect(isAimedAtStatus('相手の物理特攻')).toBe(true);
      expect(isAimedAtStatus(' 相手の命中修正')).toBe(true);
      expect(isAimedAtStatus('相手の')).toBe(false);
      expect(isAimedAtStatus('物理特攻')).toBe(false);
    });
  });

  describe('aimedAtBonusesOf()', () => {
    it('adds up the items marked 相手の of every buff, status by status', () => {
      const bonuses = aimedAtBonusesOf([buff('相手の物理特攻+2,相手の命中修正+1'), buff('相手の物理特攻+1、回避-1')]);

      expect([...bonuses]).toEqual([
        ['物理特攻', 3],
        ['命中修正', 1],
      ]);
    });

    it('passes over an item held at a value, one naming a maximum, one it cannot read and one not marked', () => {
      const bonuses = aimedAtBonusesOf([buff('相手の回避=3,相手のHP^+2,相手の攻撃+たくさん,物理特攻+5'), buff('')]);

      expect(bonuses.size).toBe(0);
    });

    it('takes a minus as a minus', () => {
      expect(aimedAtBonusesOf([buff('相手の命中修正-2')]).get('命中修正')).toBe(-2);
    });
  });
});
