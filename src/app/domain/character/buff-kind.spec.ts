import {
  BUFF_KINDS,
  buffKindFrom,
  buffKindMarkOf,
  buffKindMarkPicked,
  buffKindOf,
  markBuffKind,
  parseBuffKindWord,
  writeBuffKindMark,
} from '@axe/domain/character/buff-kind';
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

  describe('marking a buff by hand', () => {
    it('writes the mark for a buff as much as for a debuff, so a state of the room can be made a buff', () => {
      const poison = row('毒');
      expect(buffKindOf(poison, catalog)).toBe('debuff');

      markBuffKind(poison, 'buff');

      expect(buffKindMarkOf(poison)).toBe('buff');
      expect(buffKindOf(poison, catalog)).toBe('buff');
      markBuffKind(poison, 'debuff');
      expect(buffKindOf(poison, catalog)).toBe('debuff');
    });

    it('marks the first row of a buff that moves several statuses, from any of its rows', () => {
      const head = row('祝福', { [DataElementAttribute.BUFF_GROUP]: '祝福' });
      const member = row('祝福（回避）', { [DataElementAttribute.BUFF_GROUP]: '祝福' });

      markBuffKind(member, 'debuff');

      expect(buffKindMarkOf(head)).toBe('debuff');
      expect(buffKindMarkOf(member)).toBeNull();
      expect(buffKindOf(member, [])).toBe('debuff');
    });

    it('marks a further row itself where its first row is gone', () => {
      const orphan = row('祝福（回避）', { [DataElementAttribute.BUFF_GROUP]: '祝福' });

      markBuffKind(orphan, 'debuff');

      expect(buffKindMarkOf(orphan)).toBe('debuff');
    });

    it('offers the two kinds with a buff first', () => {
      expect(BUFF_KINDS).toEqual(['buff', 'debuff']);
    });
  });

  describe('the mark a kind picked on a form writes', () => {
    it('writes none while nothing is picked, whatever the name', () => {
      expect([buffKindMarkPicked(null, '盾', catalog), buffKindMarkPicked(null, '毒', catalog)]).toEqual([null, null]);
    });

    it('always writes a debuff picked', () => {
      expect([buffKindMarkPicked('debuff', '盾', catalog), buffKindMarkPicked('debuff', '毒', catalog)]).toEqual([
        'debuff',
        'debuff',
      ]);
    });

    it('writes a buff picked only for the name of a state the room keeps, which it would otherwise be a debuff by', () => {
      expect([buffKindMarkPicked('buff', '盾', catalog), buffKindMarkPicked('buff', '毒', catalog)]).toEqual([
        null,
        'buff',
      ]);
      expect(buffKindFrom(buffKindMarkPicked('buff', '毒', catalog), '毒', catalog)).toBe('buff');
    });
  });

  it('tells the kind of a buff read off its rows as it tells the row itself', () => {
    expect(buffKindFrom(null, '毒', catalog)).toBe('debuff');
    expect(buffKindFrom(null, '猛攻撃', catalog)).toBe('buff');
    expect(buffKindFrom('buff', '毒', catalog)).toBe('buff');
    expect(buffKindFrom('debuff', '猛攻撃', [])).toBe('debuff');
  });

  it('writes the mark and takes it away', () => {
    const data = row('猛攻撃');

    writeBuffKindMark(data, 'debuff');
    expect(data.getAttribute(DataElementAttribute.BUFF_KIND)).toBe('debuff');

    writeBuffKindMark(data, '');
    expect(data.getAttribute(DataElementAttribute.BUFF_KIND)).toBe('');
  });
});
