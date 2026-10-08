import { buildOverlayFeed, type OverlaySource } from '@axe/features/streaming-overlay/streaming-overlay-feed';

const NOW = 100_000;

function source(overrides: Partial<OverlaySource> = {}): OverlaySource {
  return {
    identifier: 'm1',
    name: 'アリス',
    text: 'こんばんは',
    timestamp: NOW,
    order: NOW,
    color: '#ffffff',
    isDice: false,
    isDirect: false,
    isSecret: false,
    isDisplayable: true,
    ...overrides,
  };
}

describe('buildOverlayFeed()', () => {
  it('keeps as many of the newest as it is asked for', () => {
    const sources = Array.from({ length: 10 }, (_, index) => source({ identifier: `m${index}`, text: `発言${index}` }));

    const feed = buildOverlayFeed(sources, NOW, { limit: 3, maxAgeMs: 0 });

    expect(feed.map((line) => line.text)).toEqual(['発言7', '発言8', '発言9']);
  });

  it('drops the older ones', () => {
    const feed = buildOverlayFeed(
      [source({ identifier: 'old', timestamp: NOW - 200_000 }), source({ identifier: 'new' })],
      NOW,
      { limit: 6, maxAgeMs: 120_000 }
    );

    expect(feed.map((line) => line.identifier)).toEqual(['new']);
  });

  it('leaves a private line out', () => {
    const feed = buildOverlayFeed([source({ isDirect: true }), source({ identifier: 'open' })], NOW);

    expect(feed.map((line) => line.identifier)).toEqual(['open']);
  });

  it('keeps a hidden roll off the stream', () => {
    const feed = buildOverlayFeed([source({ isSecret: true, isDice: true }), source({ identifier: 'open' })], NOW);

    expect(feed.map((line) => line.identifier)).toEqual(['open']);
  });

  it('leaves out a line that is not in the open', () => {
    const feed = buildOverlayFeed([source({ isDisplayable: false })], NOW);

    expect(feed).toEqual([]);
  });

  it('keeps a pseudo-deleted line off the stream, even from the screen of the one who said it', () => {
    const feed = buildOverlayFeed([source({ isPseudoDeleted: true }), source({ identifier: 'open' })], NOW);

    expect(feed.map((line) => line.identifier)).toEqual(['open']);
  });

  it('leaves out a line with nothing in it', () => {
    const feed = buildOverlayFeed([source({ text: '   ' })], NOW);

    expect(feed).toEqual([]);
  });

  it('marks a dice result as one', () => {
    const feed = buildOverlayFeed([source({ isDice: true, text: '2D6 → 8' })], NOW);

    expect(feed[0]).toMatchObject({ isDice: true, text: '2D6 → 8' });
  });

  it('shows nothing when it is asked for none', () => {
    expect(buildOverlayFeed([source()], NOW, { limit: 0, maxAgeMs: 0 })).toEqual([]);
  });
});
