import {
  appendSummaryTag,
  removeSummaryTag,
  splitSummaryTags,
  summaryTagFor,
  tagLeafNames,
} from '@axe/domain/data/summary-tag-list';

describe('the display items written as one line', () => {
  describe('reading the items apart', () => {
    it('takes them apart by their spaces', () => {
      expect(splitSummaryTags('HP MP 敏捷度')).toEqual(['HP', 'MP', '敏捷度']);
    });

    it('keeps a bare slash, which asks for a line break', () => {
      expect(splitSummaryTags('HP MP / メモ')).toEqual(['HP', 'MP', '/', 'メモ']);
    });

    it('reads a quoted item as one item, spaces and all', () => {
      expect(splitSummaryTags('HP "所持金 合計"')).toEqual(['HP', '所持金 合計']);
    });

    it('reads a quoted path as one item rather than a name and a line break', () => {
      expect(splitSummaryTags('"リソース/正気度"')).toEqual(['リソース/正気度']);
    });

    it('hands the quotes off, so what comes out is a reference like any other', () => {
      expect(splitSummaryTags('"HP"')).toEqual(['HP']);
    });

    it('takes what is left of an item whose quote was never closed', () => {
      expect(splitSummaryTags('HP "所持金 合計')).toEqual(['HP', '所持金 合計']);
    });

    it('reads nothing out of nothing', () => {
      expect(splitSummaryTags('')).toEqual([]);
      expect(splitSummaryTags('   ')).toEqual([]);
      expect(splitSummaryTags('""')).toEqual([]);
    });
  });

  describe('the name at the end of each item', () => {
    it('is the name itself where the item is a name', () => {
      expect(tagLeafNames(['HP', 'MP'])).toEqual(['HP', 'MP']);
    });

    it('is the last part where the item is a path', () => {
      expect(tagLeafNames(['リソース/正気度'])).toEqual(['正気度']);
    });

    it('leaves the line break out, which names nothing', () => {
      expect(tagLeafNames(['HP', '/', 'MP'])).toEqual(['HP', 'MP']);
    });

    it('keeps a slash that is part of a name', () => {
      expect(tagLeafNames(['戦闘\\/移動'])).toEqual(['戦闘/移動']);
    });

    it('says a name once however many items end on it', () => {
      expect(tagLeafNames(['リソース/HP', 'HP'])).toEqual(['HP']);
    });
  });

  describe('writing a name in', () => {
    it('writes a plain name as it is', () => {
      expect(summaryTagFor('HP')).toBe('HP');
    });

    it('quotes a name with a space in it', () => {
      expect(summaryTagFor('所持金 合計')).toBe('"所持金 合計"');
    });

    it('escapes a slash in a name, which would otherwise be read as a path', () => {
      expect(summaryTagFor('戦闘/移動')).toBe('戦闘\\/移動');
      expect(tagLeafNames(splitSummaryTags(summaryTagFor('戦闘/移動')))).toEqual(['戦闘/移動']);
    });

    it('adds a name at the end of the line, after what is written', () => {
      expect(appendSummaryTag('HP MP / ', '敏捷度')).toBe('HP MP / 敏捷度');
      expect(appendSummaryTag('', 'HP')).toBe('HP');
      expect(appendSummaryTag('HP', '所持金 合計')).toBe('HP "所持金 合計"');
    });
  });

  describe('taking a name out', () => {
    it('takes the item and the space after it, leaving the rest as written', () => {
      expect(removeSummaryTag('HP  MP / "リソース/正気度"', 'MP')).toBe('HP  / "リソース/正気度"');
    });

    it('takes the space before an item at the end of the line', () => {
      expect(removeSummaryTag('HP MP', 'MP')).toBe('HP');
    });

    it('takes an item reached by its path, by the name at its end, quotes and all', () => {
      expect(removeSummaryTag('HP "リソース/正気度" MP', '正気度')).toBe('HP MP');
    });

    it('keeps apart the items written up against the one taken out', () => {
      expect(removeSummaryTag('HP"MP"SAN', 'MP')).toBe('HP SAN');
      expect(removeSummaryTag('"MP"HP', 'MP')).toBe('HP');
    });

    it('takes every item ending in the name', () => {
      expect(removeSummaryTag('HP / リソース/HP MP', 'HP')).toBe('/ MP');
    });

    it('leaves a line that does not hold the name alone, line breaks and all', () => {
      expect(removeSummaryTag('HP / MP', '/')).toBe('HP / MP');
      expect(removeSummaryTag('HP / MP', 'SAN')).toBe('HP / MP');
    });
  });
});
