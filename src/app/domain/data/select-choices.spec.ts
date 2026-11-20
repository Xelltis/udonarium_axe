import { parseSelectChoices } from '@axe/domain/data/select-choices';

describe('parseSelectChoices', () => {
  it('reads the options apart by both lines and commas', () => {
    expect(parseSelectChoices('a,b\nc,d')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves the empty ones out', () => {
    expect(parseSelectChoices('a,,b\n\nc')).toEqual(['a', 'b', 'c']);
  });

  it('trims their ends', () => {
    expect(parseSelectChoices(' a , b\n c ')).toEqual(['a', 'b', 'c']);
  });
});
