import { toGraphemes } from '@axe/core/util/graphemes';

describe('the letters a reader sees', () => {
  it('keeps an emoji, a flag and a combined character whole', () => {
    expect(toGraphemes('a👍🏽🇯🇵が')).toEqual(['a', '👍🏽', '🇯🇵', 'が']);
  });

  it('gives nothing for empty text', () => {
    expect(toGraphemes('')).toEqual([]);
  });
});
