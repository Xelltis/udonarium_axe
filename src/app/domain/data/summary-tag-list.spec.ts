import { splitSummaryTags, tagLeafNames } from '@axe/domain/data/summary-tag-list';

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
});
