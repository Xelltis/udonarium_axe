import { nextShuffleSeed, shuffledOrder, trackAfter, trackBefore } from '@axe/domain/media/playback-order';

const TRACKS = Array.from({ length: 12 }, (_, i) => `track-${i}`);

describe('shuffledOrder', () => {
  it('holds every track once', () => {
    const order = shuffledOrder([...TRACKS, 'track-3'], 7);

    expect([...order].sort()).toEqual([...TRACKS].sort());
  });

  it('comes out the same from the same tracks and seed, however they were listed', () => {
    expect(shuffledOrder(TRACKS, 42)).toEqual(shuffledOrder([...TRACKS].reverse(), 42));
  });

  it('mixes the tracks differently for another seed', () => {
    expect(shuffledOrder(TRACKS, 1)).not.toEqual(shuffledOrder(TRACKS, 2));
  });

  it('does not keep the tracks in the order they were listed', () => {
    expect(shuffledOrder(TRACKS, 42)).not.toEqual(TRACKS);
  });

  it('leaves the others where they were when a track is added', () => {
    const before = shuffledOrder(TRACKS, 9);
    const after = shuffledOrder([...TRACKS, 'added'], 9);

    expect(after.filter((track) => track !== 'added')).toEqual(before);
  });

  it('starts from the leading track and carries the ones before it round to the end', () => {
    const plain = shuffledOrder(TRACKS, 5);
    const leading = plain[4];

    const order = shuffledOrder(TRACKS, 5, leading);

    expect(order).toEqual([...plain.slice(4), ...plain.slice(0, 4)]);
  });

  it('ignores a leading track that is not among them', () => {
    expect(shuffledOrder(TRACKS, 5, 'elsewhere')).toEqual(shuffledOrder(TRACKS, 5));
  });

  it('gives nothing for no tracks', () => {
    expect(shuffledOrder([], 5)).toEqual([]);
  });
});

describe('trackAfter', () => {
  it('gives the next track without going round', () => {
    expect(trackAfter(['a', 'b', 'c'], 'a')).toEqual({ identifier: 'b', wrapped: false });
  });

  it('goes round from the last track to the first', () => {
    expect(trackAfter(['a', 'b', 'c'], 'c')).toEqual({ identifier: 'a', wrapped: true });
  });

  it('starts at the first for a track that is not in the order', () => {
    expect(trackAfter(['a', 'b'], 'x')).toEqual({ identifier: 'a', wrapped: false });
  });

  it('gives nothing for an empty order', () => {
    expect(trackAfter([], 'a')).toEqual({ identifier: null, wrapped: false });
  });
});

describe('trackBefore', () => {
  it('gives the track before', () => {
    expect(trackBefore(['a', 'b', 'c'], 'b')).toBe('a');
  });

  it('goes round from the first track to the last', () => {
    expect(trackBefore(['a', 'b', 'c'], 'a')).toBe('c');
  });

  it('gives the last for a track that is not in the order', () => {
    expect(trackBefore(['a', 'b', 'c'], 'x')).toBe('c');
  });

  it('gives nothing for an empty order', () => {
    expect(trackBefore([], 'a')).toBeNull();
  });
});

describe('nextShuffleSeed', () => {
  it('works out the same next seed from the same seed', () => {
    expect(nextShuffleSeed(123)).toBe(nextShuffleSeed(123));
  });

  it('moves on to another seed', () => {
    expect(nextShuffleSeed(123)).not.toBe(123);
  });
});
