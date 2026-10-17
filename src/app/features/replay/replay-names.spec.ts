import { replayActorsOf } from '@axe/features/replay/replay-names';

describe('replayActorsOf', () => {
  it('lists the people under their last names, then the ids it does not know, leaving out the room server', () => {
    const actors = replayActorsOf(
      {
        actors: [
          { userId: 'alice', peerId: 'p-a', name: 'アリス', role: 'pl', imageIdentifier: '', sinceSeq: 0 },
          { userId: '@authority', peerId: '@authority', name: '', role: 'pl', imageIdentifier: '', sinceSeq: 3 },
        ],
        targets: [],
      },
      ['alice', 'bob', '@authority']
    );

    expect(actors).toEqual([
      { userId: 'alice', name: 'アリス' },
      { userId: 'bob', name: 'bob' },
    ]);
  });
});
