import { EffectPreset } from '@axe/domain/effect/effect-preset';
import {
  EffectListFilter,
  familyAtScroll,
  familyIndex,
  filterPresets,
  groupPresets,
  isMultiTarget,
  presetsShownTo,
  reachOf,
  tailSpaceFor,
} from '@axe/features/effect/effect-library-panel/effect-library-list';
import { searchTextOf } from '@axe/features/effect/effect-library-panel/effect-search';

/** The names of the kinds the specs name effects of, as the Japanese screen has them. */
const KIND_NAMES: Readonly<Record<string, string>> = { projectile: '飛翔体', breath: 'ブレス', burst: '爆発' };

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

  /** Narrows as the panel does, each effect found by its name, its family and the name of its kind. */
  function narrow(
    presets: EffectPreset[],
    more: Partial<Pick<EffectListFilter, 'query' | 'grade' | 'reach' | 'isGameMaster'>> = {}
  ): string[] {
    return filterPresets(presets, {
      query: '',
      grade: null,
      reach: null,
      isGameMaster: true,
      searchText: (preset) => searchTextOf([preset.name, preset.tagName, KIND_NAMES[preset.effectKind] ?? '']),
      ...more,
    }).map((preset) => preset.name);
  }

  describe('filterPresets()', () => {
    function catalog(): EffectPreset[] {
      const breath = makePreset('火炎のブレス', '炎', 3);
      breath.kind = 'breath';
      const bolt = makePreset('ファイアボルト', '射撃', 2);
      bolt.kind = 'projectile';
      return [
        makePreset('火の矢', '射撃', 1),
        bolt,
        makePreset('氷結', '氷', 2),
        makePreset('絶対零度', '氷', 3),
        breath,
      ];
    }

    it('lets everything through for a blank search', () => {
      expect(narrow(catalog(), { query: '   ' })).toHaveLength(5);
    });

    it('finds an effect by part of its name, by its family and by the name of its kind', () => {
      expect(narrow(catalog(), { query: 'ボルト' })).toEqual(['ファイアボルト']);
      expect(narrow(catalog(), { query: '氷' })).toEqual(['氷結', '絶対零度']);
      expect(narrow(catalog(), { query: '飛翔体' })).toEqual(['ファイアボルト']);
    });

    it('finds one named in katakana by hiragana, and one named in kanji by its reading', () => {
      expect(narrow(catalog(), { query: 'ぶれす' })).toEqual(['火炎のブレス']);
      expect(narrow(catalog(), { query: 'ひょうけつ' })).toEqual(['氷結']);
      expect(narrow(catalog(), { query: 'しゃげき' })).toEqual(['火の矢', 'ファイアボルト']);
    });

    it('asks for every word of a search of several', () => {
      expect(narrow(catalog(), { query: '射撃 矢' })).toEqual(['火の矢']);
      expect(narrow(catalog(), { query: '氷 ブレス' })).toEqual([]);
    });

    it('pays no attention to case', () => {
      expect(narrow([makePreset('Fire Bolt', 'shot')], { query: 'fire' })).toEqual(['Fire Bolt']);
    });

    it('narrows by grade, and by grade and search at once', () => {
      expect(narrow(catalog(), { grade: 3 })).toEqual(['絶対零度', '火炎のブレス']);
      expect(narrow(catalog(), { grade: 1, query: '矢' })).toEqual(['火の矢']);
    });

    it('leaves what is kept for the game master off anyone else’s list', () => {
      const secret = makePreset('伏兵の合図', '強化');
      secret.gmOnly = true;

      expect(narrow([secret, makePreset('闘気', '強化')], { isGameMaster: false })).toEqual(['闘気']);
      expect(narrow([secret], { isGameMaster: true })).toEqual(['伏兵の合図']);
      expect(presetsShownTo([secret], false)).toEqual([]);
    });
  });

  describe('narrowing by whom it reaches', () => {
    function reachCatalog(): EffectPreset[] {
      const single = makePreset('斬撃', '物理');
      single.targeting = 'single';
      const self = makePreset('闘気', '強化');
      self.targeting = 'self';
      const multi = makePreset('爆炎', '炎');
      multi.targeting = 'multi';
      multi.maxTargets = 6;
      const blast = makePreset('大爆発', '炎', 3);
      blast.targeting = 'multi';
      blast.maxTargets = 8;
      blast.areaRadius = 3;
      const inferno = makePreset('業火', '炎', 3);
      inferno.targeting = 'multi';
      inferno.maxTargets = 8;
      inferno.areaRadius = 4;
      const frozen = makePreset('絶対零度', '氷', 3);
      frozen.targeting = 'multi';
      frozen.maxTargets = 8;
      frozen.areaRadius = 3;
      return [single, self, multi, blast, inferno, frozen];
    }

    it('tells what reaches an area from what takes several picked one at a time', () => {
      expect(reachCatalog().map(reachOf)).toEqual(['single', 'self', 'multi', 'area', 'area', 'area']);
    });

    it('keeps only what reaches an area', () => {
      expect(narrow(reachCatalog(), { reach: 'area' })).toEqual(['大爆発', '業火', '絶対零度']);
    });

    it('keeps the two of the fire family that reach an area, for fire searched with the area asked for', () => {
      expect(narrow(reachCatalog(), { reach: 'area', query: '炎' })).toEqual(['大爆発', '業火']);
    });

    it('keeps only what takes several picked one at a time, an area left out', () => {
      expect(narrow(reachCatalog(), { reach: 'multi' })).toEqual(['爆炎']);
    });

    it('keeps only what takes one, one cast on its caster among them', () => {
      expect(narrow(reachCatalog(), { reach: 'single' })).toEqual(['斬撃', '闘気']);
    });

    it('lets everything through when no reach is asked for', () => {
      expect(narrow(reachCatalog())).toHaveLength(6);
    });

    it('reads how many it takes from the limit', () => {
      const [single, , multi] = reachCatalog();

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

  describe('the index of families', () => {
    function shelf(): EffectPreset[] {
      return [
        makePreset('氷結', '氷'),
        makePreset('絶対零度', '氷', 3),
        makePreset('斬撃', '物理'),
        makePreset('自作', '独自'),
      ];
    }

    it('lists every family in the order of the list, each with how many of its effects there are', () => {
      const all = shelf();

      expect(familyIndex(all, groupPresets(all, 'ja'), 'ja')).toEqual([
        { tag: '物理', count: 1, total: 1 },
        { tag: '氷', count: 2, total: 2 },
        { tag: '独自', count: 1, total: 1 },
      ]);
    });

    it('counts what the list is narrowed to and keeps a family narrowed out of it, with none', () => {
      const all = shelf();
      const listed = groupPresets(
        all.filter((preset) => preset.gradeLevel === 3),
        'ja'
      );

      expect(familyIndex(all, listed, 'ja')).toEqual([
        { tag: '物理', count: 0, total: 1 },
        { tag: '氷', count: 1, total: 2 },
        { tag: '独自', count: 0, total: 1 },
      ]);
    });

    it('has no family the reader is shown nothing of', () => {
      expect(familyIndex([], [], 'ja')).toEqual([]);
    });
  });

  describe('the family the list stands at', () => {
    const tops = [
      { tag: '物理', top: 0 },
      { tag: '打撃', top: 300 },
      { tag: '射撃', top: 520 },
    ];

    it('is the last whose heading has reached the top of what is shown', () => {
      expect(familyAtScroll(tops, 0)).toBe('物理');
      expect(familyAtScroll(tops, 298)).toBe('物理');
      expect(familyAtScroll(tops, 299)).toBe('打撃');
      expect(familyAtScroll(tops, 9000)).toBe('射撃');
    });

    it('is the first before any heading has, and none for a list without families', () => {
      expect(familyAtScroll([{ tag: '最近', top: 120 }], 0)).toBe('最近');
      expect(familyAtScroll([], 40)).toBeNull();
    });
  });

  describe('the blank left under the list', () => {
    it('is what the list is short of a full view below the heading brought to the top', () => {
      expect(tailSpaceFor(1000, 400, 880)).toBe(280);
      expect(tailSpaceFor(1000.4, 400, 880)).toBe(280);
    });

    it('is nothing where the list already runs a full view below the heading', () => {
      expect(tailSpaceFor(1000, 400, 600)).toBe(0);
      expect(tailSpaceFor(1000, 400, 100)).toBe(0);
    });
  });
});
