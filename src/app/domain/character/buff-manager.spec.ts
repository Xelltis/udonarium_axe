import { BuffManager } from '@axe/domain/character/buff-manager';
import { parseBuffModifierRequest } from '@axe/domain/character/buff-modifier';
import { StatusAccessor } from '@axe/domain/character/status-accessor';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';

describe('BuffManager', () => {
  let buffDataElement: DataElement;
  let container: DataElement;
  let manager: BuffManager;

  beforeEach(() => {
    buffDataElement = DataElement.create('バフ', '');
    container = DataElement.create('container', '');
    buffDataElement.appendChild(container);

    manager = new BuffManager(buffDataElement);
  });

  describe('snapshot and restore', () => {
    it('puts back a buff that was taken away, with its note and its rounds', () => {
      manager.addRound('猛攻撃', '攻撃+2', 3);
      manager.addRound('加速', '', 1);
      const taken = manager.snapshot();

      manager.delete('猛攻撃');
      expect(container.children.map((child) => child.name)).toEqual(['加速']);

      manager.restore(taken);

      expect(container.children.map((child) => child.name)).toEqual(['猛攻撃', '加速']);
      expect(container.getFirstElementByName('猛攻撃')!.value).toBe(3);
      expect(container.getFirstElementByName('猛攻撃')!.currentValue).toBe('攻撃+2');
    });

    it('takes away a buff the snapshot never had', () => {
      manager.addRound('猛攻撃', '', 3);
      const taken = manager.snapshot();
      manager.addRound('加速', '', 2);

      manager.restore(taken);

      expect(container.children.map((child) => child.name)).toEqual(['猛攻撃']);
    });

    it('counts the rounds back to where they stood', () => {
      manager.addRound('猛攻撃', '', 3);
      const taken = manager.snapshot();
      manager.decreaseRound();

      manager.restore(taken);

      expect(container.getFirstElementByName('猛攻撃')!.value).toBe(3);
    });

    it('moves nothing on the sheet when the same state is put back twice', () => {
      const status = {
        getValue: vi.fn(() => 10),
        changeValue: vi.fn(),
      } as unknown as StatusAccessor;
      const withStatus = new BuffManager(buffDataElement, undefined, () => status);
      withStatus.addRound('筋力強化', '', 3);
      const data = container.getFirstElementByName('筋力強化')!;
      withStatus.applyModifier(data, parseBuffModifierRequest('筋力', '+', '2')!);
      const taken = withStatus.snapshot();
      (status.changeValue as ReturnType<typeof vi.fn>).mockClear();

      withStatus.restore(taken);
      withStatus.restore(taken);

      expect(status.changeValue).not.toHaveBeenCalled();
    });
  });

  describe('addRound', () => {
    it('adds a buff', () => {
      manager.addRound('マッスルベアー', '筋力+2', 3);

      const added = container.getFirstElementByName('マッスルベアー');
      expect(added).toBeTruthy();
      expect(added!.value).toBe(3);
      expect(added!.currentValue).toBe('筋力+2');
    });

    it('adds one for three rounds with no note', () => {
      manager.addRound('バフ名');

      const added = container.getFirstElementByName('バフ名');
      expect(added).toBeTruthy();
      expect(added!.value).toBe(3);
      expect(added!.currentValue).toBe('');
    });

    it('replaces one of the same name', () => {
      manager.addRound('猫目', 'A', 5);
      manager.addRound('猫目', 'B', 2);

      const buffs = container.getElementsByName('猫目');
      expect(buffs.length).toBeLessThanOrEqual(1);
      // the values of the old one are replaced
      const data = buffDataElement.getFirstElementByName('猫目');
      expect(data).toBeTruthy();
      expect(data!.value).toBe(2);
      expect(data!.currentValue).toBe('B');
    });

    it('gives it an icon and a colour when they are given', () => {
      manager.addRound('毒', '継続2', 3, { color: '#c62828', icon: '☠️' });

      const added = container.getFirstElementByName('毒')!;
      expect(added.getAttribute(DataElementAttribute.BUFF_COLOR)).toBe('#c62828');
      expect(added.getAttribute(DataElementAttribute.BUFF_ICON)).toBe('☠️');
    });

    it('repaints one that already has them', () => {
      manager.addRound('毒', '継続2', 3, { color: '#c62828', icon: '☠️' });
      manager.addRound('毒', '継続1', 1, { color: '#2e7d32' });

      const added = container.getFirstElementByName('毒')!;
      expect(added.getAttribute(DataElementAttribute.BUFF_COLOR)).toBe('#2e7d32');
      expect(added.getAttribute(DataElementAttribute.BUFF_ICON)).toBe('☠️');
    });

    it('puts the colour back to the default when an empty one is given', () => {
      manager.addRound('毒', '継続2', 3, { color: '#c62828' });
      manager.addRound('毒', '継続2', 3, { color: '' });

      const added = container.getFirstElementByName('毒')!;
      expect(added.getAttribute(DataElementAttribute.BUFF_COLOR)).toBe('');
    });
  });

  describe('stackRound', () => {
    it('adds a second helping to the note the standing buff carries', () => {
      manager.addRound('猛攻撃', '攻撃+2', 3);
      manager.stackRound('猛攻撃', '攻撃+2', 3);

      const data = container.getFirstElementByName('猛攻撃')!;
      expect(container.getElementsByName('猛攻撃').length).toBe(1);
      expect(data.currentValue).toBe('攻撃+4');
    });

    it('takes a helping away again', () => {
      manager.addRound('猛攻撃', '攻撃+2', 3);
      manager.stackRound('猛攻撃', '攻撃-3', 3);

      expect(container.getFirstElementByName('猛攻撃')!.currentValue).toBe('攻撃-1');
    });

    it('grants a buff nobody carries yet', () => {
      manager.stackRound('猛攻撃', '攻撃+2', 4);

      const data = container.getFirstElementByName('猛攻撃')!;
      expect(data.currentValue).toBe('攻撃+2');
      expect(data.value).toBe(4);
    });

    it('keeps whichever count of rounds is longer', () => {
      manager.addRound('猛攻撃', '攻撃+2', 5);
      manager.stackRound('猛攻撃', '攻撃+2', 2);

      expect(container.getFirstElementByName('猛攻撃')!.value).toBe(5);
    });

    it('lengthens the rounds when the new helping runs longer', () => {
      manager.addRound('猛攻撃', '攻撃+2', 2);
      manager.stackRound('猛攻撃', '攻撃+2', 5);

      expect(container.getFirstElementByName('猛攻撃')!.value).toBe(5);
    });

    it('leaves the rounds where they stand when none are given', () => {
      manager.addRound('猛攻撃', '攻撃+2', 5);
      manager.stackRound('猛攻撃', '攻撃+2');

      expect(container.getFirstElementByName('猛攻撃')!.value).toBe(5);
    });

    it('counts no rounds on a buff held until it is cleared', () => {
      manager.addRound('毒', '継続2', 4, { timing: 'none' });
      manager.stackRound('毒', '継続2', 9);

      const data = container.getFirstElementByName('毒')!;
      expect(data.value).toBe(4);
      expect(data.currentValue).toBe('継続4');
    });

    it('writes the new note where the two say different things', () => {
      manager.addRound('祝福', '攻撃+2', 3);
      manager.stackRound('祝福', '防御+1', 3);

      expect(container.getFirstElementByName('祝福')!.currentValue).toBe('防御+1');
    });

    it('keeps the standing note where the helping carries none', () => {
      manager.addRound('祝福', '攻撃+2', 3);
      manager.stackRound('祝福', '', 3);

      expect(container.getFirstElementByName('祝福')!.currentValue).toBe('攻撃+2');
    });

    it('repaints the buff as a helping asks', () => {
      manager.addRound('毒', '継続2', 3, { color: '#c62828' });
      manager.stackRound('毒', '継続1', 3, { icon: '☠️' });

      const data = container.getFirstElementByName('毒')!;
      expect(data.getAttribute(DataElementAttribute.BUFF_COLOR)).toBe('#c62828');
      expect(data.getAttribute(DataElementAttribute.BUFF_ICON)).toBe('☠️');
    });
  });

  describe('extendRound', () => {
    it('adds the rounds asked for to the ones left', () => {
      manager.addRound('猛攻撃', '攻撃+2', 2);
      manager.extendRound('猛攻撃', '攻撃+2', 3);

      const data = container.getFirstElementByName('猛攻撃')!;
      expect(data.value).toBe(5);
      expect(data.currentValue).toBe('攻撃+4');
    });

    it('lengthens a buff without touching what it says when the note is empty', () => {
      manager.addRound('加護', '守り+1', 2);
      manager.extendRound('加護', '', 3);

      const data = container.getFirstElementByName('加護')!;
      expect(data.value).toBe(5);
      expect(data.currentValue).toBe('守り+1');
    });

    it('grants a buff nobody carries yet for the rounds asked for', () => {
      manager.extendRound('猛攻撃', '攻撃+2', 3);

      expect(container.getFirstElementByName('猛攻撃')!.value).toBe(3);
    });

    it('lengthens nothing on a buff held until it is cleared', () => {
      manager.addRound('毒', '継続2', 4, { timing: 'none' });
      manager.extendRound('毒', '継続2', 3);

      expect(container.getFirstElementByName('毒')!.value).toBe(4);
    });

    it('leaves the rounds where they stand when none are given', () => {
      manager.addRound('猛攻撃', '攻撃+2', 2);
      manager.extendRound('猛攻撃', '攻撃+2');

      expect(container.getFirstElementByName('猛攻撃')!.value).toBe(2);
    });
  });

  describe('delete', () => {
    it('removes a buff by name', () => {
      manager.addRound('削除対象', '', 3);
      expect(container.getFirstElementByName('削除対象')).toBeTruthy();

      const result = manager.delete('削除対象');
      expect(result).toBe(true);
      expect(container.getFirstElementByName('削除対象')).toBeFalsy();
    });

    it('is false for a name it does not have', () => {
      const result = manager.delete('存在しない');
      expect(result).toBe(false);
    });

    it('is false without a container', () => {
      const emptyBuff = DataElement.create('空バフ', '');
      const emptyManager = new BuffManager(emptyBuff);

      const result = emptyManager.delete('何か');
      expect(result).toBe(false);
    });
  });

  describe('decreaseRound', () => {
    it('counts every buff down a round', () => {
      manager.addRound('バフA', '', 5);
      manager.addRound('バフB', '', 3);

      manager.decreaseRound();

      const a = container.getFirstElementByName('バフA');
      const b = container.getFirstElementByName('バフB');
      expect(parseInt(a!.value as string)).toBe(4);
      expect(parseInt(b!.value as string)).toBe(2);
    });

    it('leaves one that waits to be taken away where it is', () => {
      manager.addRound('毒', '', 3, { timing: 'none' });

      manager.decreaseRound();
      manager.increaseRound();

      expect(parseInt(container.getFirstElementByName('毒')!.value as string)).toBe(3);
    });

    it('does not throw without one', () => {
      const emptyBuff = DataElement.create('空バフ', '');
      const emptyManager = new BuffManager(emptyBuff);
      expect(() => emptyManager.decreaseRound()).not.toThrow();
    });
  });

  describe('increaseRound', () => {
    it('counts every buff up a round', () => {
      manager.addRound('バフA', '', 2);
      manager.addRound('バフB', '', 4);

      manager.increaseRound();

      const a = container.getFirstElementByName('バフA');
      const b = container.getFirstElementByName('バフB');
      expect(parseInt(a!.value as string)).toBe(3);
      expect(parseInt(b!.value as string)).toBe(5);
    });
  });

  describe('expireOneRound', () => {
    it('counts them down, removes those that ran out and names them', () => {
      manager.addRound('続く', '', 3);
      manager.addRound('切れる', '', 1);

      expect(manager.expireOneRound()).toEqual(['切れる']);
      expect(container.getFirstElementByName('続く')!.value).toBe(2);
      expect(container.getFirstElementByName('切れる')).toBeFalsy();
    });

    it('a buff of three rounds lasts exactly three', () => {
      manager.addRound('3R', '', 3);

      expect(manager.expireOneRound()).toEqual([]);
      expect(manager.expireOneRound()).toEqual([]);
      expect(manager.expireOneRound()).toEqual(['3R']);
    });

    it('one already spent goes at once', () => {
      manager.addRound('0R', '', 0);

      expect(manager.expireOneRound()).toEqual(['0R']);
      expect(container.getFirstElementByName('0R')).toBeFalsy();
    });

    it('returns nothing when there are none', () => {
      expect(manager.expireOneRound()).toEqual([]);
    });

    it('does not throw without one', () => {
      const emptyManager = new BuffManager(DataElement.create('空バフ', ''));
      expect(() => emptyManager.expireOneRound()).not.toThrow();
      expect(emptyManager.expireOneRound()).toEqual([]);
    });
  });

  describe('deleteZeroRound', () => {
    it('removes a buff with no rounds left', () => {
      manager.addRound('残る', '', 2);
      manager.addRound('消える', '', 0);

      manager.deleteZeroRound();

      expect(container.getFirstElementByName('残る')).toBeTruthy();
      expect(container.getFirstElementByName('消える')).toBeFalsy();
    });

    it('keeps one that waits to be taken away, whatever its number says', () => {
      manager.addRound('毒', '', 0, { timing: 'none' });

      manager.deleteZeroRound();

      expect(container.getFirstElementByName('毒')).toBeTruthy();
    });

    it('removes one that has run past zero', () => {
      manager.addRound('マイナス', '', 1);
      manager.decreaseRound(); // 0
      manager.decreaseRound(); // -1

      manager.deleteZeroRound();

      expect(container.getFirstElementByName('マイナス')).toBeFalsy();
    });

    it('does not throw without one', () => {
      const emptyBuff = DataElement.create('空バフ', '');
      const emptyManager = new BuffManager(emptyBuff);
      expect(() => emptyManager.deleteZeroRound()).not.toThrow();
    });
  });

  describe('a buff that moves a status', () => {
    let status: StatusAccessor;
    let sheeted: BuffManager;

    beforeEach(() => {
      const detail = DataElement.create('detail', '');
      const group = DataElement.create('能力', '');
      detail.appendChild(group);
      group.appendChild(DataElement.create('命中', 20, { type: DataElementType.NUMBER_RESOURCE, currentValue: '10' }));
      status = new StatusAccessor(detail, () => 'テストキャラ');
      sheeted = new BuffManager(
        buffDataElement,
        () => ({ identifier: 'owner', name: 'テストキャラ' }),
        () => status
      );
    });

    function grant(name: string, target: string, operator: string, amount: string, round = 2): void {
      const request = parseBuffModifierRequest(target, operator, amount)!;
      sheeted.addRound(name, '', round);
      sheeted.applyModifier(sheeted.find(name)!, request);
    }

    it('moves the status as it goes on', () => {
      grant('猛攻撃', '命中', '+', '2');

      expect(status.getValue('命中', 'now')).toBe(12);
    });

    it('puts the status back as the buff runs out', () => {
      grant('猛攻撃', '命中', '+', '2', 1);

      expect(sheeted.expireOneRound()).toEqual(['猛攻撃']);
      expect(status.getValue('命中', 'now')).toBe(10);
    });

    it('puts the status back when the buff is taken off by hand', () => {
      grant('猛攻撃', '命中', '+', '2');

      sheeted.delete('猛攻撃');

      expect(status.getValue('命中', 'now')).toBe(10);
    });

    it('does not stack the same buff on itself', () => {
      grant('猛攻撃', '命中', '+', '2');
      grant('猛攻撃', '命中', '+', '2');

      expect(status.getValue('命中', 'now')).toBe(12);
    });

    it('puts back only as far as the status actually moved', () => {
      // The sheet caps 命中 at 20, so a buff that asked for more gives back what it got.
      grant('大猛攻撃', '命中', '+', '30');
      expect(status.getValue('命中', 'now')).toBe(20);

      sheeted.delete('大猛攻撃');

      expect(status.getValue('命中', 'now')).toBe(10);
    });

    it('holds a status at a value, and lets it go again', () => {
      grant('石化', '命中', '=', '3');
      expect(status.getValue('命中', 'now')).toBe(3);

      sheeted.delete('石化');

      expect(status.getValue('命中', 'now')).toBe(10);
    });

    it('leaves a buff that names no status a plain note', () => {
      sheeted.addRound('気合', 'なんとなく', 2);

      expect(sheeted.find('気合')).toBeTruthy();
      expect(status.getValue('命中', 'now')).toBe(10);
    });

    describe('stackModifier', () => {
      function stack(name: string, target: string, operator: string, amount: string, round = 2): void {
        const request = parseBuffModifierRequest(target, operator, amount)!;
        sheeted.stackRound(name, '', round);
        sheeted.stackModifier(sheeted.find(name)!, request);
      }

      it('moves the status a second time', () => {
        grant('猛攻撃', '命中', '+', '2');
        stack('猛攻撃', '命中', '+', '2');

        expect(status.getValue('命中', 'now')).toBe(14);
      });

      it('gives back everything the helpings moved in all', () => {
        grant('猛攻撃', '命中', '+', '2');
        stack('猛攻撃', '命中', '+', '2');

        sheeted.delete('猛攻撃');

        expect(status.getValue('命中', 'now')).toBe(10);
      });

      it('gives back only as far as the status actually moved', () => {
        // The sheet caps 命中 at 20, so the second helping only gets the 8 that were left.
        grant('猛攻撃', '命中', '+', '5');
        stack('猛攻撃', '命中', '+', '30');
        expect(status.getValue('命中', 'now')).toBe(20);

        sheeted.delete('猛攻撃');

        expect(status.getValue('命中', 'now')).toBe(10);
      });

      it('takes back a buff standing on some other status before laying this one', () => {
        const other = parseBuffModifierRequest('命中', '+', '2')!;
        sheeted.addRound('変転', '', 2);
        sheeted.applyModifier(sheeted.find('変転')!, other);
        expect(status.getValue('命中', 'now')).toBe(12);

        const moved = parseBuffModifierRequest('命中^', '+', '1')!;
        sheeted.stackModifier(sheeted.find('変転')!, moved);

        expect(status.getValue('命中', 'now')).toBe(10);
        expect(status.getValue('命中', 'max')).toBe(21);
      });
    });
  });
});
