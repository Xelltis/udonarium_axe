import { formatFoldedSections, MAX_FOLDED_SECTIONS, parseFoldedSections } from '@axe/domain/character/sheet-fold';

describe('the folded sections of a sheet', () => {
  it('reads back what was written down', () => {
    expect(parseFoldedSections(formatFoldedSections(['スキル', 'パーツ']))).toEqual(['スキル', 'パーツ']);
  });

  it('reads nothing folded from nothing written', () => {
    expect(parseFoldedSections(null)).toEqual([]);
    expect(parseFoldedSections('')).toEqual([]);
  });

  it('reads nothing folded from something that is not a list of names', () => {
    expect(parseFoldedSections('{"スキル":true}')).toEqual([]);
    expect(parseFoldedSections('[スキル')).toEqual([]);
  });

  it('skips what is not a name in the list', () => {
    expect(parseFoldedSections('["スキル", 3, "", null]')).toEqual(['スキル']);
  });

  it('keeps each name once', () => {
    expect(parseFoldedSections(formatFoldedSections(['スキル', 'スキル']))).toEqual(['スキル']);
  });

  it('forgets the oldest past the most it keeps', () => {
    const names = Array.from({ length: MAX_FOLDED_SECTIONS + 5 }, (_, index) => `セクション${index}`);

    const kept = parseFoldedSections(formatFoldedSections(names));

    expect(kept).toHaveLength(MAX_FOLDED_SECTIONS);
    expect(kept[0]).toBe('セクション5');
  });
});
