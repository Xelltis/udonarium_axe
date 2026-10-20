import { StatusAccessor } from '@axe/domain/character/status-accessor';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';

describe('StatusAccessor', () => {
  let detailDataElement: DataElement;
  let accessor: StatusAccessor;

  function createNumberResource(name: string, max: number, current: number): DataElement {
    return DataElement.create(name, max, {
      type: DataElementType.NUMBER_RESOURCE,
      currentValue: String(current),
    });
  }

  beforeEach(() => {
    detailDataElement = DataElement.create('detail', '');

    const resourceGroup = DataElement.create('リソース', '');
    detailDataElement.appendChild(resourceGroup);
    resourceGroup.appendChild(createNumberResource('HP', 200, 150));
    resourceGroup.appendChild(createNumberResource('MP', 100, 80));

    const abilityGroup = DataElement.create('能力', '');
    detailDataElement.appendChild(abilityGroup);
    abilityGroup.appendChild(DataElement.create('器用度', 24));
    abilityGroup.appendChild(DataElement.create('メモ', 'テスト用メモ', { type: DataElementType.NOTE }));

    accessor = new StatusAccessor(detailDataElement, () => 'テストキャラ');
  });

  describe('canChangeName', () => {
    it('is true for a resource', () => {
      expect(accessor.canChangeName('HP')).toBe(true);
    });

    it('is true for plain text', () => {
      expect(accessor.canChangeName('器用度')).toBe(true);
    });

    it('is true for a note', () => {
      expect(accessor.canChangeName('メモ')).toBe(true);
    });

    it('is false for a name it does not have', () => {
      expect(accessor.canChangeName('存在しない')).toBe(false);
    });

    it('tells two of a short name apart by their paths', () => {
      const skillSection = DataElement.create('戦闘特技', '');
      const skillA = DataElement.create('最終能力', '');
      const skillB = DataElement.create('Lv1', '');
      skillA.appendChild(DataElement.create('名称', 'オーバークリエイト'));
      skillB.appendChild(DataElement.create('名称', 'ストラグチャアタック'));
      detailDataElement.appendChild(skillSection);
      skillSection.appendChild(skillA);
      skillSection.appendChild(skillB);

      expect(accessor.canChangeName('名称')).toBe(false);
      expect(accessor.canChangeName('戦闘特技/最終能力/名称')).toBe(true);
      expect(accessor.getTextType('戦闘特技/Lv1/名称')).toBe('value');
    });
  });

  describe('canChange', () => {
    it('is true for the current value of a resource', () => {
      expect(accessor.canChange('HP', 'now')).toBe(true);
    });

    it('is true for its maximum', () => {
      expect(accessor.canChange('HP', 'max')).toBe(true);
    });

    it('is true for the value of text', () => {
      expect(accessor.canChange('器用度', 'now')).toBe(true);
    });

    it('is false for a maximum it does not have', () => {
      expect(accessor.canChange('器用度', 'max')).toBe(false);
    });

    it('is false for a name it does not have', () => {
      expect(accessor.canChange('不明', 'now')).toBe(false);
    });
  });

  describe('getType', () => {
    it('returns the current value of a resource', () => {
      expect(accessor.getType('HP', 'now')).toBe('currentValue');
    });

    it('returns its maximum', () => {
      expect(accessor.getType('HP', 'max')).toBe('value');
    });

    it('returns the value of text', () => {
      expect(accessor.getType('器用度', 'now')).toBe('value');
    });
  });

  describe('getValue / setValue', () => {
    it('reads the current value of a resource', () => {
      expect(accessor.getValue('HP', 'now')).toBe(150);
    });

    it('reads its maximum', () => {
      expect(accessor.getValue('HP', 'max')).toBe(200);
    });

    it('takes a new current value on a resource', () => {
      accessor.setValue('HP', 'now', 100);
      expect(accessor.getValue('HP', 'now')).toBe(100);
    });

    it('takes a new maximum on one', () => {
      accessor.setValue('HP', 'max', 300);
      expect(accessor.getValue('HP', 'max')).toBe(300);
    });

    it('is false when it writes to a name it does not have', () => {
      expect(accessor.setValue('不明', 'now', 0)).toBe(false);
    });
  });

  describe('getTextType', () => {
    it('returns the current value for a resource', () => {
      expect(accessor.getTextType('HP')).toBe('currentValue');
    });

    it('returns the value for plain text', () => {
      expect(accessor.getTextType('器用度')).toBe('value');
    });
  });

  describe('setText', () => {
    it('writes to a text field', () => {
      accessor.setText('器用度', '30');
      const el = detailDataElement.getFirstElementByName('器用度');
      expect(el!.value).toBe('30');
    });

    it('is false for a name it does not have', () => {
      expect(accessor.setText('不明', 'X')).toBe(false);
    });
  });

  describe('changeValue', () => {
    it('adds to the current value and says what it did', () => {
      const result = accessor.changeValue('HP', 'now', 10);
      expect(result).toContain('テストキャラ');
      expect(result).toContain('150');
      expect(result).toContain('160');
      expect(accessor.getValue('HP', 'now')).toBe(160);
    });

    it('takes from it', () => {
      const result = accessor.changeValue('HP', 'now', -30);
      expect(result).toContain('150');
      expect(result).toContain('120');
      expect(accessor.getValue('HP', 'now')).toBe(120);
    });

    it('stops at the maximum when it is asked to', () => {
      const result = accessor.changeValue('HP', 'now', 100, false, true);
      expect(result).toContain('(最大)');
      expect(accessor.getValue('HP', 'now')).toBe(200);
    });

    it('stops at nothing when it is asked to', () => {
      const result = accessor.changeValue('HP', 'now', -300, true);
      expect(result).toContain('(最小)');
      expect(accessor.getValue('HP', 'now')).toBe(0);
    });

    it('returns nothing for a name it does not have', () => {
      expect(accessor.changeValue('不明', 'now', 10)).toBe('');
    });

    it('keeps to a floor set on the attribute without being asked', () => {
      const hp = detailDataElement.getFirstElementByName('HP')!;
      hp.setAttribute('min', '-50');
      const result = accessor.changeValue('HP', 'now', -300);
      expect(accessor.getValue('HP', 'now')).toBe(-50);
      expect(result).toContain('(最小)');
    });

    it('keeps to it on a write from the chat as well', () => {
      const hp = detailDataElement.getFirstElementByName('HP')!;
      hp.setAttribute('min', '-50');
      accessor.setValue('HP', 'now', -300);
      expect(accessor.getValue('HP', 'now')).toBe(-50);
    });

    it('never lets the current maximum past the original', () => {
      const hp = detailDataElement.getFirstElementByName('HP')!;
      hp.setAttribute('max', '400');
      accessor.setValue('HP', 'max', 9999);
      expect(accessor.getValue('HP', 'max')).toBe(400);
    });

    it('never lets the current value past the current maximum', () => {
      // a maximum and a current value below it
      accessor.setValue('HP', 'now', 9999);
      expect(accessor.getValue('HP', 'now')).toBe(200);
    });

    describe('on a resource set to go over its maximum', () => {
      beforeEach(() => {
        detailDataElement.getFirstElementByName('HP')!.setAttribute(DataElementAttribute.OVER_RESOURCE, 'true');
      });

      it('lets the current value past the maximum, written or moved, and back to the maximum after', () => {
        accessor.setValue('HP', 'now', 250);
        expect(accessor.getValue('HP', 'now')).toBe(250);
        expect(accessor.changeValue('HP', 'now', 20)).not.toContain('(最大)');
        expect(accessor.getValue('HP', 'now')).toBe(270);

        accessor.setValue('HP', 'now', accessor.getValue('HP', 'max')!);

        expect(accessor.getValue('HP', 'now')).toBe(200);
      });

      it('still stops at the maximum when it is asked to', () => {
        accessor.changeValue('HP', 'now', 100, false, true);
        expect(accessor.getValue('HP', 'now')).toBe(200);
      });

      it('keeps a current value over a maximum a correction lowers, and to its floor', () => {
        const hp = detailDataElement.getFirstElementByName('HP')!;
        hp.setAttribute('min', '0');
        hp.setAttribute('max-base', '200');
        accessor.setValue('HP', 'maxCorrection', -100);
        expect(accessor.getValue('HP', 'max')).toBe(100);
        expect(accessor.getValue('HP', 'now')).toBe(150);

        accessor.setValue('HP', 'now', -10);

        expect(accessor.getValue('HP', 'now')).toBe(0);
      });
    });

    it('works the effective maximum out from the base and the correction, and caps the value there', () => {
      const hp = detailDataElement.getFirstElementByName('HP')!;
      hp.setAttribute('max-base', '300');
      hp.setAttribute('max-correction', '-50');
      // effectiveMax = 250
      accessor.setValue('HP', 'max', 9999);
      expect(accessor.getValue('HP', 'max')).toBe(250);
    });

    it('moves that maximum with the correction and clamps the value again', () => {
      const hp = detailDataElement.getFirstElementByName('HP')!;
      hp.setAttribute('max-base', '300');
      // the current maximum is raised and then pulled back by the correction
      accessor.setValue('HP', 'max', 300);
      expect(accessor.getValue('HP', 'max')).toBe(300);
      accessor.setValue('HP', 'maxCorrection', -100);
      // which lowers the effective maximum and the value with it
      expect(accessor.getValue('HP', 'max')).toBe(200);
      expect(accessor.getValue('HP', 'maxCorrection')).toBe(-100);
    });

    it('moves the effective minimum with its correction', () => {
      const hp = detailDataElement.getFirstElementByName('HP')!;
      hp.setAttribute('min-base', '0');
      hp.setAttribute('min-correction', '10');
      accessor.setValue('HP', 'now', -50);
      expect(accessor.getValue('HP', 'now')).toBe(10);
    });

    it('removes the attribute when the correction goes to nothing', () => {
      const hp = detailDataElement.getFirstElementByName('HP')!;
      hp.setAttribute('max-correction', '50');
      accessor.setValue('HP', 'maxCorrection', 0);
      expect(hp.getAttribute('max-correction')).toBe('');
    });

    it('carries the current maximum up with the base', () => {
      const hp = detailDataElement.getFirstElementByName('HP')!;
      hp.setAttribute('max-base', '200');
      accessor.setValue('HP', 'max', 200);
      expect(accessor.getValue('HP', 'max')).toBe(200);

      accessor.setValue('HP', 'maxBase', 400);
      expect(hp.getAttribute('max-base')).toBe('400');
      expect(accessor.getValue('HP', 'max')).toBe(400);
    });

    it('carries it up with the correction too', () => {
      const hp = detailDataElement.getFirstElementByName('HP')!;
      hp.setAttribute('max-base', '200');
      accessor.setValue('HP', 'max', 200);

      accessor.setValue('HP', 'maxCorrection', 50);
      expect(accessor.getValue('HP', 'max')).toBe(250);
    });
  });
});
