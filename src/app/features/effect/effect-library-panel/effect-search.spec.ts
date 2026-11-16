import {
  foldForSearch,
  highlightParts,
  matchesSearch,
  searchTerms,
  searchTextOf,
} from '@axe/features/effect/effect-library-panel/effect-search';

describe('searching the list of effects', () => {
  describe('how a text is compared', () => {
    it('takes katakana for hiragana and capitals for small letters', () => {
      expect(foldForSearch('ファイアボルト')).toBe('ふぁいあぼると');
      expect(foldForSearch('Fire Bolt')).toBe('fire bolt');
      expect(foldForSearch('ヴァー')).toBe('ゔぁー');
    });

    it('takes half-width kana and full-width letters for their plain forms', () => {
      expect(foldForSearch('ﾌﾞﾚｽ')).toBe('ぶれす');
      expect(foldForSearch('ＡＢＣ１')).toBe('abc1');
    });

    it('leaves kanji and hiragana as written', () => {
      expect(foldForSearch('氷のブレス')).toBe('氷のぶれす');
    });
  });

  describe('the words of a search', () => {
    it('are cut at blanks of either width, and none for a blank search', () => {
      expect(searchTerms(' 炎　ブレス ')).toEqual(['炎', 'ぶれす']);
      expect(searchTerms('  ')).toEqual([]);
    });
  });

  describe('what an effect is found by', () => {
    const text = searchTextOf(['火炎のブレス', '炎', 'ブレス']);

    it('is found as written and as read', () => {
      expect(matchesSearch(text, '火炎')).toBe(true);
      expect(matchesSearch(text, 'かえん')).toBe(true);
      expect(matchesSearch(text, 'ほのお')).toBe(true);
      expect(matchesSearch(text, 'ブレス')).toBe(true);
      expect(matchesSearch(text, 'ぶれす')).toBe(true);
      expect(matchesSearch(text, 'ﾌﾞﾚｽ')).toBe(true);
    });

    it('is not found by what none of its texts holds, nor by a word run across two of them', () => {
      expect(matchesSearch(text, 'こおり')).toBe(false);
      expect(matchesSearch(text, 'ブレス炎')).toBe(false);
    });

    it('needs every word of the search, in any order', () => {
      expect(matchesSearch(text, 'ぶれす 炎')).toBe(true);
      expect(matchesSearch(text, 'ぶれす 氷')).toBe(false);
    });

    it('matches everything for a blank search', () => {
      expect(matchesSearch(text, '')).toBe(true);
      expect(matchesSearch('', '  ')).toBe(true);
    });
  });

  describe('marking what was asked for', () => {
    it('cuts a text into the runs asked for and the runs between', () => {
      expect(highlightParts('火炎のブレス', 'ブレス')).toEqual([
        { text: '火炎の', hit: false },
        { text: 'ブレス', hit: true },
      ]);
    });

    it('marks katakana asked for in hiragana, and keeps the text as it was written', () => {
      expect(highlightParts('雷のブレス', 'ぶれす')).toEqual([
        { text: '雷の', hit: false },
        { text: 'ブレス', hit: true },
      ]);
      expect(highlightParts('Fire Bolt', 'BOLT')).toEqual([
        { text: 'Fire ', hit: false },
        { text: 'Bolt', hit: true },
      ]);
    });

    it('marks every place a word stands and every word of the search', () => {
      expect(highlightParts('矢の連射の矢', '矢 連射')).toEqual([
        { text: '矢', hit: true },
        { text: 'の', hit: false },
        { text: '連射', hit: true },
        { text: 'の', hit: false },
        { text: '矢', hit: true },
      ]);
    });

    it('marks nothing in one found by its reading, for a blank search or in an empty text', () => {
      expect(highlightParts('氷結', 'ひょうけつ')).toEqual([{ text: '氷結', hit: false }]);
      expect(highlightParts('氷結', ' ')).toEqual([{ text: '氷結', hit: false }]);
      expect(highlightParts('', '氷')).toEqual([{ text: '', hit: false }]);
    });
  });
});
