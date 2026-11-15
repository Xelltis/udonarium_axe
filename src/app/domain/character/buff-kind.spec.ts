import { buffKindMarkOf, buffKindOf, parseBuffKindWord, writeBuffKindMark } from '@axe/domain/character/buff-kind';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';

describe('whether a buff is a buff or a debuff', () => {
  const catalog = [newStatusAilment('毒'), newStatusAilment('麻痺')];
  let container: DataElement;

  function row(name: string, attributes: Record<string, string> = {}): DataElement {
    const data = DataElement.create(name, 3, { type: DataElementType.NUMBER_RESOURCE, currentValue: '' });
    for (const [key, value] of Object.entries(attributes)) data.setAttribute(key, value);
    container.appendChild(data);
    return data;
  }

  beforeEach(() => {
    container = DataElement.create('バフ/デバフ', '');
  });

  afterEach(() => container.destroy());

  describe('buffKindOf (acceptance 1)', () => {
    it('reads a buff with no mark as a buff', () => {
      expect(buffKindOf(row('猛攻撃'), catalog)).toBe('buff');
    });

    it('reads a buff with no mark that goes by the name of a state the room keeps as a debuff', () => {
      expect(buffKindOf(row('毒'), catalog)).toBe('debuff');
      expect(buffKindOf(row('毒'), [])).toBe('buff');
    });

    it('takes the mark over the room’s list of states, either way', () => {
      expect(buffKindOf(row('毒', { [DataElementAttribute.BUFF_KIND]: 'buff' }), catalog)).toBe('buff');
      expect(buffKindOf(row('猛攻撃', { [DataElementAttribute.BUFF_KIND]: 'debuff' }), catalog)).toBe('debuff');
    });

    it.each(['', ' ', 'DEBUFF', 'curse', '0'])('reads the mark "%s" as no mark at all', (mark) => {
      expect(buffKindMarkOf(row('猛攻撃', { [DataElementAttribute.BUFF_KIND]: mark }))).toBeNull();
      expect(buffKindOf(row('猛攻撃', { [DataElementAttribute.BUFF_KIND]: mark }), catalog)).toBe('buff');
      expect(buffKindOf(row('毒', { [DataElementAttribute.BUFF_KIND]: mark }), catalog)).toBe('debuff');
    });

    it('reads neither the colour nor the way the status moves for a sign', () => {
      const data = row('弱体', {
        [DataElementAttribute.BUFF_COLOR]: '#c62828',
        [DataElementAttribute.BUFF_MOD_TARGET]: '命中',
        [DataElementAttribute.BUFF_MOD_OPERATOR]: 'add',
        [DataElementAttribute.BUFF_MOD_APPLIED]: '-2',
      });

      expect(buffKindOf(data, catalog)).toBe('buff');
    });
  });

  describe('a further row of a buff that moves several statuses', () => {
    it('is whatever its first row is marked, whatever it is marked itself', () => {
      row('呪縛', { [DataElementAttribute.BUFF_GROUP]: '呪縛', [DataElementAttribute.BUFF_KIND]: 'debuff' });
      const further = row('呪縛（回避）', {
        [DataElementAttribute.BUFF_GROUP]: '呪縛',
        [DataElementAttribute.BUFF_KIND]: 'buff',
      });

      expect(buffKindOf(further, catalog)).toBe('debuff');
    });

    it('is a debuff where its first row has no mark and goes by the name of a state', () => {
      row('毒', { [DataElementAttribute.BUFF_GROUP]: '毒' });
      const further = row('毒（回避）', { [DataElementAttribute.BUFF_GROUP]: '毒' });

      expect(buffKindOf(further, catalog)).toBe('debuff');
      expect(buffKindOf(further, [])).toBe('buff');
    });

    it('answers for itself by the name of its buff where the first row is gone', () => {
      const orphan = row('毒（回避）', { [DataElementAttribute.BUFF_GROUP]: '毒' });
      const marked = row('祝福（回避）', {
        [DataElementAttribute.BUFF_GROUP]: '祝福',
        [DataElementAttribute.BUFF_KIND]: 'debuff',
      });

      expect(buffKindOf(orphan, catalog)).toBe('debuff');
      expect(buffKindOf(marked, catalog)).toBe('debuff');
    });
  });

  describe('the words that mark a buff', () => {
    it.each([
      ['デバフ', 'debuff'],
      ['debuff', 'debuff'],
      ['Debuff', 'debuff'],
      ['ｄｅｂｕｆｆ', 'debuff'],
      ['バフ', 'buff'],
      ['buff', 'buff'],
      [' BUFF ', 'buff'],
    ])('reads %s as %s', (word, kind) => {
      expect(parseBuffKindWord(word)).toBe(kind);
    });

    it.each(['', 'デバフ2', '弱体', 'buffs', '🔥'])('reads %s as no such word', (word) => {
      expect(parseBuffKindWord(word)).toBeNull();
    });
  });

  it('writes the mark and takes it away', () => {
    const data = row('猛攻撃');

    writeBuffKindMark(data, 'debuff');
    expect(data.getAttribute(DataElementAttribute.BUFF_KIND)).toBe('debuff');

    writeBuffKindMark(data, '');
    expect(data.getAttribute(DataElementAttribute.BUFF_KIND)).toBe('');
  });
});
