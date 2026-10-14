import {
  clearBuffModifier,
  describeBuffModifier,
  parseBuffModifierRequest,
  readBuffAmount,
  readBuffModifier,
  writeBuffModifier,
} from '@axe/domain/character/buff-modifier';
import { DataElement, DataElementType } from '@axe/domain/data/data-element';

describe('buff-modifier', () => {
  function makeBuff(): DataElement {
    return DataElement.create('猛攻撃', 3, { type: DataElementType.NUMBER_RESOURCE, currentValue: '' });
  }

  describe('parseBuffModifierRequest()', () => {
    it('reads a status, an operator and an amount', () => {
      expect(parseBuffModifierRequest('命中', '+', '2')).toEqual({
        target: '命中',
        slot: 'now',
        operator: 'add',
        amount: 2,
      });
    });

    it('turns a subtraction into a move in the other direction', () => {
      expect(parseBuffModifierRequest('回避', '-', '1')?.amount).toBe(-1);
    });

    it('takes the full-width operators a Japanese keyboard produces', () => {
      expect(parseBuffModifierRequest('命中', '＋', '２'.normalize('NFKC'))?.amount).toBe(2);
      expect(parseBuffModifierRequest('命中', '－', '1')?.amount).toBe(-1);
    });

    it('reads a caret as the far side of a resource', () => {
      expect(parseBuffModifierRequest('HP^', '+', '5')).toMatchObject({ target: 'HP', slot: 'max' });
    });

    it('reads the bounds a resource is built from, the way the chat writes them', () => {
      expect(parseBuffModifierRequest('HP_MAX', '+', '5')).toMatchObject({ target: 'HP', slot: 'maxBase' });
      expect(parseBuffModifierRequest('HP_MAX_BUFF', '+', '5')).toMatchObject({
        target: 'HP',
        slot: 'maxCorrection',
      });
      expect(parseBuffModifierRequest('HP_MIN', '-', '5')).toMatchObject({ target: 'HP', slot: 'minBase' });
      expect(parseBuffModifierRequest('HP_MIN_BUFF', '-', '5')).toMatchObject({
        target: 'HP',
        slot: 'minCorrection',
      });
    });

    it('holds a status at a value where it is told to', () => {
      expect(parseBuffModifierRequest('防護点', '=', '10')).toMatchObject({ operator: 'set', amount: 10 });
    });

    it('refuses what it cannot read', () => {
      expect(parseBuffModifierRequest('', '+', '2')).toBeNull();
      expect(parseBuffModifierRequest('命中', '?', '2')).toBeNull();
      expect(parseBuffModifierRequest('命中', '+', 'たくさん')).toBeNull();
    });

    it('works out an amount written as a sum', () => {
      expect(parseBuffModifierRequest('攻撃', '+', '(3+4)÷2')?.amount).toBe(3);
      expect(parseBuffModifierRequest('攻撃', '+', '2×3')?.amount).toBe(6);
      expect(parseBuffModifierRequest('攻撃', '-', '2×3')?.amount).toBe(-6);
      expect(parseBuffModifierRequest('防護点', '=', '(4+4)÷2')).toMatchObject({ operator: 'set', amount: 4 });
    });

    it('reads a sum typed in full-width characters', () => {
      expect(parseBuffModifierRequest('攻撃', '+', '（１０＋２）／２')?.amount).toBe(6);
      expect(parseBuffModifierRequest('攻撃', '+', '１０÷３')?.amount).toBe(3);
      expect(parseBuffModifierRequest('攻撃', '+', '−2+5')?.amount).toBe(3);
    });
  });

  describe('readBuffAmount()', () => {
    it('reads a number as it always did, fraction and all', () => {
      expect(readBuffAmount('2')).toBe(2);
      expect(readBuffAmount('2.5')).toBe(2.5);
      expect(readBuffAmount('-3')).toBe(-3);
      expect(readBuffAmount('+4')).toBe(4);
      expect(readBuffAmount('')).toBe(0);
    });

    it('rounds a division down where it falls, as the dice bot does', () => {
      expect(readBuffAmount('7÷2')).toBe(3);
      expect(readBuffAmount('(5÷2)×2')).toBe(4);
      expect(readBuffAmount('-7÷2')).toBe(-4);
      expect(readBuffAmount('+(3+4)÷2')).toBe(3);
    });

    it('leaves the rounding to floor, ceil and round when the sum asks for it', () => {
      expect(readBuffAmount('ceil(7÷2)')).toBe(4);
      expect(readBuffAmount('round(5÷2)')).toBe(3);
      expect(readBuffAmount('floor(7÷2)')).toBe(3);
      expect(readBuffAmount('max(7÷2,1)')).toBe(3);
    });

    it('gives NaN for what is not a sum, or divides by nothing', () => {
      expect(readBuffAmount('たくさん')).toBeNaN();
      expect(readBuffAmount('1÷0')).toBeNaN();
      expect(readBuffAmount('(1+2')).toBeNaN();
    });
  });

  describe('describeBuffModifier()', () => {
    it('writes the effect the way a sheet would', () => {
      expect(describeBuffModifier(parseBuffModifierRequest('命中', '+', '2')!)).toBe('命中+2');
      expect(describeBuffModifier(parseBuffModifierRequest('回避', '-', '1')!)).toBe('回避-1');
      expect(describeBuffModifier(parseBuffModifierRequest('HP^', '+', '5')!)).toBe('最大HP+5');
      expect(describeBuffModifier(parseBuffModifierRequest('防護点', '=', '10')!)).toBe('防護点=10');
    });
  });

  describe('reading it back', () => {
    it('keeps how far the status moved, which is what puts it back', () => {
      const buff = makeBuff();
      writeBuffModifier(buff, { target: '命中', slot: 'now', operator: 'add', applied: 2 });

      expect(readBuffModifier(buff)).toEqual({ target: '命中', slot: 'now', operator: 'add', applied: 2 });

      clearBuffModifier(buff);
      expect(readBuffModifier(buff)).toBeNull();
    });

    it('says nothing for a buff that moves no status', () => {
      expect(readBuffModifier(makeBuff())).toBeNull();
    });

    it('keeps a buff written against a bound', () => {
      const buff = makeBuff();
      writeBuffModifier(buff, { target: 'HP', slot: 'maxCorrection', operator: 'add', applied: 5 });

      expect(readBuffModifier(buff)?.slot).toBe('maxCorrection');
    });

    it('reads a slot it does not know as the value, as an older version meant it', () => {
      const buff = makeBuff();
      writeBuffModifier(buff, { target: 'HP', slot: 'now', operator: 'add', applied: 2 });
      buff.setAttribute('cs-buff-mod-slot', 'sideways');

      expect(readBuffModifier(buff)?.slot).toBe('now');
    });
  });
});
