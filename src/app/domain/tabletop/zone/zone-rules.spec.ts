import {
  DEFAULT_ZONE_RULES,
  parseZoneSizes,
  resolveZoneRules,
  zoneLimitOf,
  zoneSizeFor,
} from '@axe/domain/tabletop/zone/zone-rules';

describe('zone-rules', () => {
  describe('parseZoneSizes', () => {
    it('reads count:radius:side rows, smallest count first', () => {
      expect(parseZoneSizes('5:3:5, 10:4:7')).toEqual([
        { upTo: 5, radiusM: 3, sideM: 5 },
        { upTo: 10, radiusM: 4, sideM: 7 },
      ]);
    });

    it('takes full-width separators and fractions of a metre', () => {
      expect(parseZoneSizes('3：1.5：2、6:2.5:4')).toEqual([
        { upTo: 3, radiusM: 1.5, sideM: 2 },
        { upTo: 6, radiusM: 2.5, sideM: 4 },
      ]);
    });

    it('leaves out a row it cannot read, a size of nothing, and a count no higher than the last', () => {
      expect(parseZoneSizes('4:2:3,x:1:1,6:0:2,4:3:5,8:3')).toEqual([{ upTo: 4, radiusM: 2, sideM: 3 }]);
      expect(parseZoneSizes('2.5:1:1')).toEqual([]);
    });
  });

  describe('resolveZoneRules', () => {
    it('plays the defaults for a room that has written nothing', () => {
      expect(resolveZoneRules(null)).toEqual(DEFAULT_ZONE_RULES);
      expect(resolveZoneRules({ enabled: null, sizes: null, countField: null, samePointM: null })).toEqual(
        DEFAULT_ZONE_RULES
      );
    });

    it('takes what the room wrote, and the default sizes where it wrote none it could read', () => {
      const rules = resolveZoneRules({ enabled: true, sizes: 'nothing', countField: ' 体数 ', samePointM: 0 });

      expect(rules.enabled).toBe(true);
      expect(rules.sizes).toEqual(DEFAULT_ZONE_RULES.sizes);
      expect(rules.countField).toBe('体数');
      expect(rules.samePointM).toBe(0);
    });
  });

  it('blocks a line of fire half a metre out by default, and fires past nothing', () => {
    expect(resolveZoneRules(null).blockRadiusM).toBe(0.5);
    expect(resolveZoneRules({ blockRadiusM: 2, clearName: ' 精密 ' })).toMatchObject({
      blockRadiusM: 2,
      clearName: '精密',
    });
    expect(resolveZoneRules({ blockRadiusM: -1 }).blockRadiusM).toBe(0.5);
  });

  describe('zoneSizeFor', () => {
    const sizes = parseZoneSizes('5:3:5,10:4:7,20:6:10');

    it('takes the first row that holds the count, its edge included', () => {
      expect(zoneSizeFor(sizes, 2).radiusM).toBe(3);
      expect(zoneSizeFor(sizes, 5).radiusM).toBe(3);
      expect(zoneSizeFor(sizes, 6).radiusM).toBe(4);
      expect(zoneSizeFor(sizes, 20).sideM).toBe(10);
    });

    it('stays at the last row past it, which is the most a zone holds', () => {
      expect(zoneSizeFor(sizes, 25).radiusM).toBe(6);
      expect(zoneLimitOf(sizes)).toBe(20);
    });
  });
});
