import {
  asResourceSlot,
  readNamedResourceSlot,
  RESOURCE_SLOTS,
  resourceSlotBadgePrefix,
  resourceSlotLabel,
} from '@axe/domain/data/resource-slot';

describe('the slots of a resource', () => {
  it('names the value, its maximum, and the base and correction of either bound', () => {
    expect(RESOURCE_SLOTS).toEqual(['now', 'max', 'maxBase', 'maxCorrection', 'minBase', 'minCorrection']);
  });

  describe('reading one by name', () => {
    it('takes a slot it knows', () => {
      expect(asResourceSlot('maxCorrection')).toBe('maxCorrection');
    });

    it('takes nothing else', () => {
      expect(asResourceSlot('sideways')).toBeNull();
      expect(asResourceSlot('')).toBeNull();
      expect(asResourceSlot(null)).toBeNull();
    });
  });

  describe('reading one off the end of a name', () => {
    it('reads a bare name as the value itself', () => {
      expect(readNamedResourceSlot('HP')).toEqual({ name: 'HP', slot: 'now' });
    });

    it('reads a caret as the maximum it stands at', () => {
      expect(readNamedResourceSlot('HP^')).toEqual({ name: 'HP', slot: 'max' });
      expect(readNamedResourceSlot('HP＾')).toEqual({ name: 'HP', slot: 'max' });
    });

    it('reads the base of either bound', () => {
      expect(readNamedResourceSlot('HP_MAX')).toEqual({ name: 'HP', slot: 'maxBase' });
      expect(readNamedResourceSlot('HP_MIN')).toEqual({ name: 'HP', slot: 'minBase' });
    });

    it('reads the correction on top of it', () => {
      expect(readNamedResourceSlot('HP_MAX_BUFF')).toEqual({ name: 'HP', slot: 'maxCorrection' });
      expect(readNamedResourceSlot('HP_MIN_BUFF')).toEqual({ name: 'HP', slot: 'minCorrection' });
    });

    it('reads the longer form first, so a correction is not read as a base', () => {
      expect(readNamedResourceSlot('HP_MAX_BUFF').slot).not.toBe('maxBase');
    });

    it('reads it however it was typed', () => {
      expect(readNamedResourceSlot('hp_max')).toEqual({ name: 'hp', slot: 'maxBase' });
      expect(readNamedResourceSlot('ＨＰ＿ＭＡＸ')).toEqual({ name: 'ＨＰ', slot: 'maxBase' });
    });

    it('leaves a name that is nothing but a slot alone', () => {
      // Which is a name to look up like any other, and one no sheet is likely to have.
      expect(readNamedResourceSlot('_MAX')).toEqual({ name: '_MAX', slot: 'now' });
      expect(readNamedResourceSlot('^')).toEqual({ name: '^', slot: 'now' });
    });

    it('lets go of the space after a name', () => {
      expect(readNamedResourceSlot('HP^  ')).toEqual({ name: 'HP', slot: 'max' });
    });
  });

  describe('how each one reads', () => {
    it('says nothing for the value itself, which needs no saying', () => {
      expect(resourceSlotLabel('now')).toBe('');
      expect(resourceSlotBadgePrefix('now')).toBe('');
    });

    it('has a word for every slot otherwise', () => {
      for (const slot of RESOURCE_SLOTS) {
        if (slot === 'now') continue;
        expect(resourceSlotLabel(slot).length).toBeGreaterThan(0);
        expect(resourceSlotBadgePrefix(slot).length).toBeGreaterThan(0);
      }
    });

    it('keeps the badge shorter than the line', () => {
      expect(resourceSlotBadgePrefix('max')).toBe('最大');
      expect(resourceSlotLabel('max')).toBe('最大値');
    });
  });
});
