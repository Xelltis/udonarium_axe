import { ObjectStore } from '@axe/core/sync/object-store';
import {
  composeLayers,
  groundOf,
  handOf,
  type ItemLayer,
  noteLeftByBuffs,
  settleItem,
  takeInItem,
} from '@axe/domain/character/buff-layers';
import { BuffManager, type BuffSnapshotEntry } from '@axe/domain/character/buff-manager';
import {
  parseBuffModifierRequest,
  readBuffTextModifier,
  writeBuffModifier,
  writeBuffTextModifier,
} from '@axe/domain/character/buff-modifier';
import type { BuffRequestOutcome } from '@axe/domain/character/item-landing';
import { StatusAccessor } from '@axe/domain/character/status-accessor';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';

const words = (text: string, order: number, tie = ''): ItemLayer => ({ kind: 'words', text, order, tie });
const move = (by: number, order: number, tie = ''): ItemLayer => ({ kind: 'move', by, order, tie });

describe('buff-layers', () => {
  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  describe('laying an item out', () => {
    it('shows the latest words over the ground, and a move adds to the number beneath it', () => {
      expect(composeLayers('無属性', [])).toBe('無属性');
      expect(composeLayers('無属性', [words('雷', 2), words('炎', 1)])).toBe('雷');
      expect(composeLayers('1', [words('3', 1), move(1, 2)])).toBe('4');
      expect(composeLayers('1', [move(1, 1), words('3', 2)])).toBe('3');
      expect(composeLayers('炎', [move(1, 1)])).toBe('炎');
      expect(composeLayers('x', [words('A', 1, 'b'), words('B', 1, 'a')])).toBe('A');
    });

    it('moves the number words lead with in its place, keeping its places after the point and the unit after it', () => {
      expect(composeLayers('1.5', [move(1, 1)])).toBe('2.5');
      expect(composeLayers('10m', [move(1, 1)])).toBe('11m');
      expect(composeLayers('0.1', [move(0.2, 1)])).toBe('0.3');
      expect(composeLayers(' -3 点', [move(5, 1)])).toBe(' 2 点');
      expect(composeLayers('12', [move(0.1, 1), move(0.2, 2)])).toBe('12.3');
      expect(composeLayers('12.3', [move(-(0.1 + 0.2), 1)])).toBe('12.0');
      expect(composeLayers('+3', [move(1, 1)])).toBe('+4');
      expect(composeLayers('07', [move(1, 1)])).toBe('08');
      expect(composeLayers('10', [move(-3, 1)])).toBe('7');
      expect(composeLayers('2', [move(-5, 1)])).toBe('-3');
    });

    it('works a moved number out in decimals, however small, large or long the amount and the number are', () => {
      expect(composeLayers('1', [move(0.0000001, 1)])).toBe('1.0000001');
      expect(composeLayers('1', [move(1e-11, 1)])).toBe('1');
      expect(composeLayers('0.3', [move(-0.1, 1)])).toBe('0.2');
      expect(composeLayers('123456789012345678901234', [move(1, 1)])).toBe('123456789012345678901235');
      expect(composeLayers('1', [move(1e21, 1)])).toBe('1000000000000000000001');
      expect(composeLayers('0.05', [move(-0.1, 1)])).toBe('-0.05');
      expect(composeLayers('+1', [move(-1, 1)])).toBe('+0');
      expect(composeLayers('1', [move(Number.NaN, 1)])).toBe('1');
    });

    it('takes words written otherwise as a layer of their own, over those laid before and under those laid after', () => {
      const item = DataElement.create('属性', '炎');
      noteLeftByBuffs(item);
      takeInItem(item, [words('炎', 1)], () => 99);
      expect(groundOf(item)).toBe('炎');
      item.value = '風';

      takeInItem(item, [words('炎', 1)], () => 5);

      expect(handOf(item)).toMatchObject({ text: '風', order: 5 });
      expect(composeLayers(groundOf(item)!, [words('炎', 1), handOf(item)!, words('雷', 6)])).toBe('雷');
    });

    it('works the ground of an item a move from before layers stands on back out of what it holds', () => {
      const item = DataElement.create('レベル', '3');

      takeInItem(item, [move(2, 0)], () => 1);

      expect(groundOf(item)).toBe('1');
    });

    it('writes what it shows, a number as a number, keeps the words written otherwise, and lets the ground go once no buff stands', () => {
      const item = DataElement.create('体力', 10);
      takeInItem(item, [], () => 1);

      settleItem([item], [move(-3, 1)]);
      expect(item.value).toBe(7);

      item.value = 12;
      takeInItem(item, [move(-3, 1)], () => 2);
      settleItem([item], []);

      expect(item.value).toBe(12);
      expect(groundOf(item)).toBeNull();
      expect(handOf(item)).toMatchObject({ text: '12' });
    });
  });

  describe('the buffs that lay words and moves on an item (every case the reviews found)', () => {
    let detail: DataElement;
    let status: StatusAccessor;
    let buffs: BuffManager;
    let buffElement: DataElement;
    const snapshots = new Map<string, BuffSnapshotEntry[]>();

    beforeEach(() => {
      snapshots.clear();
      detail = DataElement.create('detail', '');
      const section = DataElement.create('能力', '', { [DataElementAttribute.ROLE]: 'section' });
      const group = DataElement.create('能力', '', { [DataElementAttribute.ROLE]: 'group' });
      detail.appendChild(section);
      section.appendChild(group);
      group.appendChild(DataElement.create('属性', '無属性', { [DataElementAttribute.ROLE]: 'field' }));
      group.appendChild(
        DataElement.create('レベル', '1', {
          [DataElementAttribute.ROLE]: 'field',
          [DataElementAttribute.FIELD_TYPE]: 'select',
          [DataElementAttribute.CHOICES]: '1,2,3,4,5',
        })
      );
      group.appendChild(DataElement.create('命中', 20, { type: DataElementType.NUMBER_RESOURCE, currentValue: '10' }));
      buffElement = DataElement.create('buffs', '');
      status = new StatusAccessor(detail, () => 'テストキャラ');
      buffs = new BuffManager(
        buffElement,
        () => ({ identifier: 'owner', name: 'テストキャラ' }),
        () => status
      );
    });

    function lay(name: string, target: string, operator: string, amount: string): BuffRequestOutcome {
      return buffs.alter(() => {
        buffs.addRound(name, '', 3);
        return buffs.applyModifier(buffs.find(name)!, parseBuffModifierRequest(target, operator, amount)!, true);
      });
    }

    type Step =
      | readonly ['lay', string, string, string, string]
      | readonly ['off', string]
      | readonly ['hand', string, string]
      | readonly ['snap', string]
      | readonly ['restore', string];

    function run(step: Step): void {
      if (step[0] === 'lay') lay(step[1], step[2], step[3], step[4]);
      else if (step[0] === 'off') buffs.delete(step[1]);
      else if (step[0] === 'hand') status.setText(step[1], step[2]);
      else if (step[0] === 'snap') snapshots.set(step[1], buffs.snapshot());
      else buffs.restore(snapshots.get(step[1])!);
    }

    const cases: [string, string, [Step, string | null][]][] = [
      [
        'two buffs, the lower one taken off first',
        '属性',
        [
          [['lay', 'A', '属性', '=', '炎'], '炎'],
          [['lay', 'B', '属性', '=', '氷'], '氷'],
          [['off', 'A'], '氷'],
          [['off', 'B'], '無属性'],
        ],
      ],
      [
        'two buffs, the upper one taken off first',
        '属性',
        [
          [['lay', 'A', '属性', '=', '炎'], '炎'],
          [['lay', 'B', '属性', '=', '氷'], '氷'],
          [['off', 'B'], '炎'],
          [['off', 'A'], '無属性'],
        ],
      ],
      [
        'words written by hand while a buff stands stay as it goes',
        '属性',
        [
          [['lay', 'A', '属性', '=', '炎'], '炎'],
          [['hand', '属性', '雷'], '雷'],
          [['off', 'A'], '雷'],
        ],
      ],
      [
        'a buff laid over words written by hand gives them back as it goes',
        '属性',
        [
          [['lay', 'A', '属性', '=', '炎'], '炎'],
          [['hand', '属性', '風'], '風'],
          [['lay', 'B', '属性', '=', '雷'], '雷'],
          [['off', 'A'], '雷'],
          [['off', 'B'], '風'],
        ],
      ],
      [
        'words written by hand stay over a buff a step brings back from before them',
        '属性',
        [
          [['lay', 'A', '属性', '=', '炎'], '炎'],
          [['snap', 'step'], '炎'],
          [['off', 'A'], '無属性'],
          [['hand', '属性', '風'], '風'],
          [['restore', 'step'], '風'],
          [['off', 'A'], '風'],
        ],
      ],
      [
        'a step undone brings a buff back under one laid after it',
        '属性',
        [
          [['lay', 'A', '属性', '=', '炎'], '炎'],
          [['lay', 'B', '属性', '=', '氷'], '氷'],
          [['snap', 'both'], '氷'],
          [['off', 'A'], '氷'],
          [['restore', 'both'], '氷'],
          [['off', 'B'], '炎'],
          [['off', 'A'], '無属性'],
        ],
      ],
      [
        'a move and words on one item, the words laid last',
        'レベル',
        [
          [['lay', 'B', 'レベル', '+', '1'], '2'],
          [['lay', 'A', 'レベル', '=', '3'], '3'],
          [['off', 'A'], '2'],
          [['off', 'B'], '1'],
        ],
      ],
      [
        'a move and words on one item, the move laid last',
        'レベル',
        [
          [['lay', 'A', 'レベル', '=', '3'], '3'],
          [['lay', 'B', 'レベル', '+', '1'], '4'],
          [['off', 'A'], '2'],
          [['off', 'B'], '1'],
        ],
      ],
      [
        'a name in full-width letters lays on the item of its half-width name',
        'レベル',
        [
          [['lay', 'A', 'レベル', '+', '１'], '2'],
          [['off', 'A'], '1'],
        ],
      ],
      [
        'an item made for words goes with the buff, and one written into by hand stays the sheet’s own',
        '武器',
        [
          [['lay', 'A', '武器', '=', '炎'], '炎'],
          [['off', 'A'], null],
          [['lay', 'A', '武器', '=', '炎'], '炎'],
          [['hand', '武器', '雷'], '雷'],
          [['off', 'A'], '雷'],
        ],
      ],
    ];

    it.each(cases)('%s', (_name, item, steps) => {
      for (const [step, shown] of steps) {
        run(step);
        expect(status.getText(item), step.join(' ')).toBe(shown);
      }
    });

    it('lays a buff of one name again with the other kind in one change, making its item again of that kind', () => {
      expect(lay('X', '新', '+', '2')).toEqual({ kind: 'makes' });
      expect(status.getValue('新', 'now')).toBe(2);

      expect(lay('X', '新', '=', '炎')).toEqual({ kind: 'makes' });
      expect(status.getText('新')).toBe('炎');

      buffs.delete('X');
      expect(status.getText('新')).toBeNull();
    });

    it('finds the item a buff names once as it is laid', () => {
      buffs.addRound('A', '', 3);
      const finds = vi.spyOn(status, 'targetOf');

      buffs.applyModifier(buffs.find('A')!, parseBuffModifierRequest('属性', '=', '炎')!, true);

      expect(finds).toHaveBeenCalledTimes(1);
    });

    it('lists the items buffs made once for a snapshot, however many buffs there are', () => {
      for (const name of ['A', 'B', 'C']) lay(name, '属性', '=', name);
      const listed = vi.spyOn(status, 'madeItems');

      buffs.snapshot();

      expect(listed).toHaveBeenCalledTimes(1);
    });

    it('lays two buffs laid at one order, as two devices may at once, the same way on every device', () => {
      lay('A', '属性', '=', '炎');
      lay('B', '属性', '=', '氷');
      const [first, second] = [buffs.find('A')!, buffs.find('B')!].sort((a, b) =>
        a.identifier < b.identifier ? -1 : 1
      );
      writeBuffTextModifier(second, { ...readBuffTextModifier(second)!, order: readBuffTextModifier(first)!.order });

      buffs.delete(first.name);
      expect(status.getText('属性')).toBe(readBuffTextModifier(second)!.text);
      buffs.delete(second.name);
      expect(status.getText('属性')).toBe('無属性');
    });

    it('reads a move a version before layers laid on an item holding a choice, which shows in what it holds, as laid beneath them', () => {
      detail.getFirstElementByName('レベル')!.value = '3';
      buffs.addRound('古い', '', 3);
      writeBuffModifier(buffs.find('古い')!, { target: 'レベル', slot: 'now', operator: 'add', applied: 2 });

      lay('新', 'レベル', '=', '5');
      expect(status.getText('レベル')).toBe('5');
      buffs.delete('新');
      expect(status.getText('レベル')).toBe('3');
      buffs.delete('古い');
      expect(status.getText('レベル')).toBe('1');
    });

    it('leaves a move asked to stay where it is as its buff goes, on a line of text as on a number', () => {
      const level = detail.getFirstElementByName('属性')!;
      level.value = '10';
      buffs.alter(() => {
        buffs.addRound('毒', '', 3);
        buffs.applyModifier(buffs.find('毒')!, parseBuffModifierRequest(':属性', '+', '-3')!);
      });
      expect(status.getText('属性')).toBe('7');

      buffs.delete('毒');

      expect(status.getText('属性')).toBe('7');
    });
  });
});
