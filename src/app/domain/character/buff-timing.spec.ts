import {
  buffEffectTimingOf,
  buffExpires,
  buffTimingOf,
  buffTriggerOf,
  BuffTurnActor,
  isBuffDueAt,
  isBuffEffectDueAt,
  isBuffEffectTimingField,
  isBuffTimingToken,
  resolveBuffEffectTiming,
  resolveBuffTiming,
  writeBuffEffectTiming,
} from '@axe/domain/character/buff-timing';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';

describe('buff-timing', () => {
  const owner: BuffTurnActor = { identifier: 'owner-id', name: '受け手' };
  const caster: BuffTurnActor = { identifier: 'caster-id', name: '術者' };

  function makeBuff(attributes: Record<string, string> = {}): DataElement {
    const element = DataElement.create('猛攻撃', 3, { type: DataElementType.NUMBER_RESOURCE, currentValue: '攻+1' });
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }

  describe('resolveBuffTiming()', () => {
    it('reads the timings written the way a table would say them', () => {
      expect(resolveBuffTiming('ラウンド終了時')).toBe('roundEnd');
      expect(resolveBuffTiming('手番開始')).toBe('turnStart');
      expect(resolveBuffTiming('turnEnd')).toBe('turnEnd');
      expect(resolveBuffTiming('TurnStart')).toBe('turnStart');
    });

    it('says nothing about a word that is not a timing', () => {
      expect(resolveBuffTiming('☠️')).toBeNull();
      expect(isBuffTimingToken('red')).toBe(false);
    });
  });

  describe('buffTimingOf()', () => {
    it('leaves a buff nobody said anything about ending with the round', () => {
      expect(buffTimingOf(makeBuff())).toBe('roundEnd');
    });

    it('falls back to the round for a timing it does not know', () => {
      expect(buffTimingOf(makeBuff({ [DataElementAttribute.BUFF_TIMING]: 'いつか' }))).toBe('roundEnd');
    });
  });

  describe('buffExpires()', () => {
    it('says a buff on the clock runs out', () => {
      expect(buffExpires(makeBuff())).toBe(true);
      expect(buffExpires(makeBuff({ [DataElementAttribute.BUFF_TIMING]: 'turnStart' }))).toBe(true);
    });

    it('says one that waits to be taken away does not', () => {
      expect(buffExpires(makeBuff({ [DataElementAttribute.BUFF_TIMING]: 'none' }))).toBe(false);
      expect(resolveBuffTiming('永続')).toBe('none');
    });

    it('never counts one down, whichever moment comes round', () => {
      const held = makeBuff({ [DataElementAttribute.BUFF_TIMING]: 'none' });

      expect(isBuffDueAt(held, 'roundEnd', owner, owner)).toBe(false);
      expect(isBuffDueAt(held, 'turnStart', owner, owner)).toBe(false);
      expect(isBuffDueAt(held, 'turnEnd', owner, owner)).toBe(false);
    });
  });

  describe('isBuffDueAt()', () => {
    it('counts a plain buff down at the end of every round', () => {
      const buff = makeBuff();

      expect(isBuffDueAt(buff, 'roundEnd', owner, { identifier: '', name: '' })).toBe(true);
      expect(isBuffDueAt(buff, 'turnStart', owner, owner)).toBe(false);
    });

    it('waits for the bearer where no trigger was named', () => {
      const buff = makeBuff({ [DataElementAttribute.BUFF_TIMING]: 'turnStart' });

      expect(isBuffDueAt(buff, 'turnStart', owner, owner)).toBe(true);
      expect(isBuffDueAt(buff, 'turnStart', owner, caster)).toBe(false);
    });

    it("waits for the caster's turn where the spell says so", () => {
      // Sword World's enhancements run out as their caster comes round again.
      const buff = makeBuff({
        [DataElementAttribute.BUFF_TIMING]: 'turnStart',
        [DataElementAttribute.BUFF_TRIGGER]: 'caster-id',
      });

      expect(isBuffDueAt(buff, 'turnStart', owner, caster)).toBe(true);
      expect(isBuffDueAt(buff, 'turnStart', owner, owner)).toBe(false);
      expect(isBuffDueAt(buff, 'roundEnd', owner, { identifier: '', name: '' })).toBe(false);
    });

    it('takes a trigger written down as a name, which is what a chat command has', () => {
      const buff = makeBuff({
        [DataElementAttribute.BUFF_TIMING]: 'turnEnd',
        [DataElementAttribute.BUFF_TRIGGER]: '術者',
      });

      expect(buffTriggerOf(buff)).toBe('術者');
      expect(isBuffDueAt(buff, 'turnEnd', owner, caster)).toBe(true);
      expect(isBuffDueAt(buff, 'turnEnd', owner, owner)).toBe(false);
    });
  });

  describe('the moment a buff moves its effect at', () => {
    it('is read behind 発生: or tick:, in any word a countdown is timed with', () => {
      expect(resolveBuffEffectTiming('発生:手番終了')).toBe('turnEnd');
      expect(resolveBuffEffectTiming('発生：手番開始時')).toBe('turnStart');
      expect(resolveBuffEffectTiming('tick:turnEnd')).toBe('turnEnd');
      expect(resolveBuffEffectTiming('TICK: start')).toBe('turnStart');
      expect(resolveBuffEffectTiming('発生:ラウンド終了')).toBe('roundEnd');
      expect(resolveBuffEffectTiming('tick:r')).toBe('roundEnd');
    });

    it('is not read from a bare timing, nor from a mark with no moment an effect moves at', () => {
      expect(resolveBuffEffectTiming('手番終了')).toBeNull();
      expect(resolveBuffEffectTiming('発生:none')).toBeNull();
      expect(resolveBuffEffectTiming('発生:消えない')).toBeNull();
      expect(resolveBuffEffectTiming('発生:いつか')).toBeNull();
      expect(resolveBuffEffectTiming('発生:')).toBeNull();
      expect(resolveBuffEffectTiming('')).toBeNull();
    });

    it('knows a field written with the mark, readable or not', () => {
      expect(isBuffEffectTimingField('発生:手番終了')).toBe(true);
      expect(isBuffEffectTimingField('tick:いつか')).toBe(true);
      expect(isBuffEffectTimingField('手番終了')).toBe(false);
      expect(isBuffEffectTimingField('@発生')).toBe(false);
    });

    it('is none on a buff that writes none, an empty one or one this version does not know', () => {
      expect(buffEffectTimingOf(makeBuff())).toBeNull();
      expect(buffEffectTimingOf(makeBuff({ [DataElementAttribute.BUFF_EFFECT_TIMING]: '' }))).toBeNull();
      expect(buffEffectTimingOf(makeBuff({ [DataElementAttribute.BUFF_EFFECT_TIMING]: '  ' }))).toBeNull();
      expect(buffEffectTimingOf(makeBuff({ [DataElementAttribute.BUFF_EFFECT_TIMING]: 'none' }))).toBeNull();
      expect(buffEffectTimingOf(makeBuff({ [DataElementAttribute.BUFF_EFFECT_TIMING]: 'someday' }))).toBeNull();
      expect(buffEffectTimingOf(makeBuff({ [DataElementAttribute.BUFF_EFFECT_TIMING]: 'turnEnd' }))).toBe('turnEnd');
    });

    it('is written and taken away again', () => {
      const buff = makeBuff();
      writeBuffEffectTiming(buff, 'turnStart');
      expect(buff.getAttribute(DataElementAttribute.BUFF_EFFECT_TIMING)).toBe('turnStart');
      writeBuffEffectTiming(buff, '');
      expect(DataElementAttribute.BUFF_EFFECT_TIMING in buff.toAttributes()).toBe(false);
    });

    it('leaves a buff with rounds and no moment of its own to move as it is counted', () => {
      const buff = makeBuff();
      expect(isBuffEffectDueAt(buff, 'roundEnd', owner, { identifier: '', name: '' })).toBe(false);
      expect(isBuffEffectDueAt(buff, 'turnStart', owner, owner)).toBe(false);
    });

    it('moves a buff never counted down at the end of the round, and at no turn', () => {
      const buff = makeBuff({ [DataElementAttribute.BUFF_TIMING]: 'none' });
      expect(isBuffEffectDueAt(buff, 'roundEnd', owner, { identifier: '', name: '' })).toBe(true);
      expect(isBuffEffectDueAt(buff, 'turnStart', owner, owner)).toBe(false);
      expect(isBuffEffectDueAt(buff, 'turnEnd', owner, owner)).toBe(false);
    });

    it("moves at the buff's own moment alone, on the turn of the piece carrying it whatever its trigger", () => {
      const buff = makeBuff({
        [DataElementAttribute.BUFF_TIMING]: 'turnStart',
        [DataElementAttribute.BUFF_TRIGGER]: caster.identifier,
        [DataElementAttribute.BUFF_EFFECT_TIMING]: 'turnEnd',
      });
      expect(isBuffEffectDueAt(buff, 'turnEnd', owner, owner)).toBe(true);
      expect(isBuffEffectDueAt(buff, 'turnEnd', owner, caster)).toBe(false);
      expect(isBuffEffectDueAt(buff, 'turnStart', owner, caster)).toBe(false);
      expect(isBuffEffectDueAt(buff, 'roundEnd', owner, { identifier: '', name: '' })).toBe(false);
    });

    it('moves a buff never counted down at its own moment in place of the end of the round', () => {
      const buff = makeBuff({
        [DataElementAttribute.BUFF_TIMING]: 'none',
        [DataElementAttribute.BUFF_EFFECT_TIMING]: 'turnStart',
      });
      expect(isBuffEffectDueAt(buff, 'turnStart', owner, owner)).toBe(true);
      expect(isBuffEffectDueAt(buff, 'roundEnd', owner, { identifier: '', name: '' })).toBe(false);
    });

    it('moves at the end of the round for whoever carries it, where that is its own moment', () => {
      const buff = makeBuff({
        [DataElementAttribute.BUFF_TIMING]: 'turnStart',
        [DataElementAttribute.BUFF_EFFECT_TIMING]: 'roundEnd',
      });
      expect(isBuffEffectDueAt(buff, 'roundEnd', owner, { identifier: '', name: '' })).toBe(true);
    });
  });
});
