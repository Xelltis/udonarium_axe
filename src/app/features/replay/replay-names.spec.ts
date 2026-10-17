import { replayActorsOf, replayNamesAt } from '@axe/features/replay/replay-names';

describe('replayNamesAt', () => {
  it('calls a piece and a person by the first name they had, at a point before it was taken', () => {
    const names = replayNamesAt(
      {
        actors: [{ userId: 'alice', peerId: 'p-a', name: 'アリス', role: 'pl', imageIdentifier: '', sinceSeq: 250 }],
        targets: [{ identifier: 'c1', aliasName: 'character', name: 'ゴブリン', sinceSeq: 250 }],
      },
      12
    );

    expect(names.actorName('alice')).toBe('アリス');
    expect(names.targetName('c1')).toBe('ゴブリン');
    expect(names.targetName('unknown')).toBe('unknown');
  });
});

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
