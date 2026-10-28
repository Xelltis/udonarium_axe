import { referenceSites } from '@axe/domain/chat/chat-reference';

describe('referenceSites', () => {
  it('places each reference and reads its name in half-width', () => {
    const text = '2d6+{筋力}+ｔ｛ＨＰ＾｝';
    const sites = referenceSites(text);
    expect(sites.map((site) => [text.slice(site.from, site.to), site.name, site.targeted, site.useMax])).toEqual([
      ['{筋力}', '筋力', false, false],
      ['ｔ｛ＨＰ＾｝', 'HP', true, true],
    ]);
  });

  it('finds the same references however often it is asked', () => {
    expect(referenceSites('{a} {b}')).toHaveLength(2);
    expect(referenceSites('{a} {b}')).toHaveLength(2);
  });
});
