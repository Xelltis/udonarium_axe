import { EffectPreset } from '@axe/domain/effect/effect-preset';
import {
  collectTags,
  filterPresets,
  groupPresets,
  isMultiTarget,
  matchesQuery,
} from '@axe/features/effect/effect-library-panel/effect-library-list';

describe('the effect library', () => {
  let created: EffectPreset[] = [];

  function makePreset(name: string, tag: string, grade = 2): EffectPreset {
    const preset = new EffectPreset(`preset-${created.length}`);
    preset.name = name;
    preset.tagName = tag;
    preset.grade = grade;
    created.push(preset);
    return preset;
  }

  afterEach(() => {
    created = [];
  });

  describe('matchesQuery()', () => {
    const preset = () => makePreset('ファイアボルト', '射撃');

    it('lets everything through for an empty search', () => {
      expect(matchesQuery(preset(), '   ')).toBe(true);
    });

    it('finds an effect by part of its name', () => {
      expect(matchesQuery(preset(), 'ボルト')).toBe(true);
      expect(matchesQuery(preset(), '氷結')).toBe(false);
    });

    it('finds one by its family', () => {
      expect(matchesQuery(preset(), '射撃')).toBe(true);
    });

    it('pays no attention to case', () => {
      expect(matchesQuery(makePreset('Fire Bolt', 'shot'), 'fire')).toBe(true);
    });
  });

  describe('filterPresets()', () => {
    function catalog(): EffectPreset[] {
      return [
        makePreset('火の矢', '射撃', 1),
        makePreset('ファイアボルト', '射撃', 2),
        makePreset('氷結', '氷', 2),
        makePreset('絶対零度', '氷', 3),
      ];
    }

    it('narrows by family', () => {
      expect(filterPresets(catalog(), '', '氷', null).map((preset) => preset.name)).toEqual(['氷結', '絶対零度']);
    });

    it('narrows by grade', () => {
      expect(filterPresets(catalog(), '', null, 3).map((preset) => preset.name)).toEqual(['絶対零度']);
    });

    it('narrows by both at once', () => {
      expect(filterPresets(catalog(), '矢', '射撃', 1).map((preset) => preset.name)).toEqual(['火の矢']);
    });
  });

  describe('narrowing by how many it can aim at', () => {
    function targetsCatalog(): EffectPreset[] {
      const single = makePreset('斬撃', '物理');
      single.targeting = 'single';
      const self = makePreset('闘気', '強化');
      self.targeting = 'self';
      const multi = makePreset('爆炎', '炎');
      multi.targeting = 'multi';
      multi.maxTargets = 6;
      return [single, self, multi];
    }

    it('keeps only what takes several targets', () => {
      expect(filterPresets(targetsCatalog(), '', null, null, 'multi').map((preset) => preset.name)).toEqual(['爆炎']);
    });

    it('keeps only what takes one', () => {
      // Something that only touches the caster counts as one.
      expect(filterPresets(targetsCatalog(), '', null, null, 'single').map((preset) => preset.name)).toEqual([
        '斬撃',
        '闘気',
      ]);
    });

    it('lets everything through when neither is asked for', () => {
      expect(filterPresets(targetsCatalog(), '', null, null, null)).toHaveLength(3);
    });

    it('reads how many it takes from the limit', () => {
      const [single, , multi] = targetsCatalog();

      expect(isMultiTarget(single)).toBe(false);
      expect(isMultiTarget(multi)).toBe(true);
    });
  });

  describe('groupPresets()', () => {
    it('gathers them by family and puts the families in their usual order', () => {
      const groups = groupPresets(
        [makePreset('氷結', '氷'), makePreset('斬撃', '物理'), makePreset('爆炎', '炎')],
        'ja'
      );

      expect(groups.map((group) => group.tag)).toEqual(['物理', '炎', '氷']);
    });

    it('puts the holy family after the dark one, before those of no element', () => {
      const groups = groupPresets(
        [makePreset('治癒', '回復'), makePreset('聖印', '聖'), makePreset('転移', '時空'), makePreset('呪い', '闇')],
        'ja'
      );

      expect(groups.map((group) => group.tag)).toEqual(['闇', '聖', '時空', '回復']);
    });

    it('orders a family by grade', () => {
      const groups = groupPresets(
        [makePreset('絶対零度', '氷', 3), makePreset('氷礫', '氷', 1), makePreset('氷結', '氷', 2)],
        'ja'
      );

      expect(groups[0].presets.map((preset) => preset.name)).toEqual(['氷礫', '氷結', '絶対零度']);
    });

    it('orders the names of one grade as the reader’s language sorts them', () => {
      const presets = [makePreset('Zorn', '氷'), makePreset('Ärger', '氷'), makePreset('Zebra', '氷')];
      const names = (language: string) => groupPresets(presets, language)[0].presets.map((preset) => preset.name);

      expect(names('en')).toEqual(['Ärger', 'Zebra', 'Zorn']);
      expect(names('sv')).toEqual(['Zebra', 'Zorn', 'Ärger']);
    });

    it('puts an unknown family and an unnamed one at the back', () => {
      const groups = groupPresets([makePreset('謎', ''), makePreset('自作', '独自'), makePreset('斬撃', '物理')], 'ja');

      expect(groups.map((group) => group.tag)).toEqual(['物理', '独自', '']);
    });
  });

  describe('collectTags()', () => {
    it('folds the repeats and returns the families in that order', () => {
      const tags = collectTags([
        makePreset('氷結', '氷'),
        makePreset('絶対零度', '氷'),
        makePreset('斬撃', '物理'),
        makePreset('無記名', ''),
      ]);

      expect(tags).toEqual(['物理', '氷']);
    });
  });
});
