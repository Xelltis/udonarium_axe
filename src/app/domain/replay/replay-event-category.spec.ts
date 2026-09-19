import { PUBLIC_VISIBILITY, type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import {
  flagReplayParts,
  REPLAY_PART_FLAG,
  replayEventCategory,
  replayPartJudge,
} from '@axe/domain/replay/replay-event-category';
import { buildLongReplayFixture, SHORT_SESSION } from '@axe/testing/replay-fixtures';

function event(kind: ReplayEventKind, detail: Record<string, unknown> = {}, targetId = 'piece', seq = 1): ReplayEvent {
  return { seq, at: 0, t: 0, kind, actorId: 'gm', targetId, detail, visibility: PUBLIC_VISIBILITY };
}

describe('replay event categories', () => {
  it('counts what was said and staged as the story', () => {
    expect(replayEventCategory(event(ReplayEventKind.ChatMessage))).toBe('story');
    expect(replayEventCategory(event(ReplayEventKind.ChatDice))).toBe('story');
    expect(replayEventCategory(event(ReplayEventKind.Marker))).toBe('story');
    expect(replayEventCategory(event(ReplayEventKind.MediaCutIn))).toBe('story');
    expect(replayEventCategory(event(ReplayEventKind.VnScene))).toBe('story');
  });

  it('counts what happened to the pieces as the board', () => {
    expect(replayEventCategory(event(ReplayEventKind.ObjectMove))).toBe('board');
    expect(replayEventCategory(event(ReplayEventKind.ObjectCreate))).toBe('board');
    expect(replayEventCategory(event(ReplayEventKind.ObjectValue, { name: 'HP' }))).toBe('board');
  });

  it('counts the running of the room as system', () => {
    expect(replayEventCategory(event(ReplayEventKind.PeerJoin))).toBe('system');
    expect(replayEventCategory(event(ReplayEventKind.ObjectLock))).toBe('system');
    expect(replayEventCategory(event(ReplayEventKind.VnPlayhead))).toBe('system');
    expect(replayEventCategory(event('unknown.kind' as ReplayEventKind))).toBe('system');
  });

  it('counts a notice the tool wrote into the chat as system', () => {
    expect(replayEventCategory(event(ReplayEventKind.ChatMessage, { from: 'System' }))).toBe('system');
    expect(replayEventCategory(event(ReplayEventKind.ChatMessage, { from: 'alice', tag: 'system-message' }))).toBe(
      'system'
    );
    expect(replayEventCategory(event(ReplayEventKind.ChatMessage, { from: 'alice' }))).toBe('story');
  });

  it('hides the parts that arrive and leave with their piece', () => {
    expect(replayEventCategory(event(ReplayEventKind.ObjectCreate, { [REPLAY_PART_FLAG]: true }))).toBe('hidden');
    expect(replayEventCategory(event(ReplayEventKind.ObjectRemove, { [REPLAY_PART_FLAG]: true }))).toBe('hidden');
  });

  it('hides the cue of a change of value, which the value event already tells', () => {
    expect(replayEventCategory(event(ReplayEventKind.ObjectValue, { changes: [] }))).toBe('hidden');
  });

  describe('finding the parts', () => {
    it('takes what the manifest gives an owner', () => {
      const isPart = replayPartJudge(
        [
          { identifier: 'boss', aliasName: 'character', name: 'ボス', sinceSeq: 0 },
          { identifier: 'boss-hp', aliasName: 'data', name: 'HP', ownerIdentifier: 'boss', sinceSeq: 0 },
        ],
        []
      );

      expect(isPart('boss-hp', 5)).toBe(true);
      expect(isPart('boss', 5)).toBe(false);
    });

    it('judges a card by the owner it had at the time, so one drawn from its deck is a piece again', () => {
      const isPart = replayPartJudge(
        [
          { identifier: 'ace', aliasName: 'card', name: 'A', sinceSeq: 1 },
          { identifier: 'ace', aliasName: 'card', name: 'A', ownerIdentifier: 'deck', sinceSeq: 10 },
          { identifier: 'ace', aliasName: 'card', name: 'A', sinceSeq: 20 },
        ],
        []
      );

      expect(isPart('ace', 5)).toBe(false);
      expect(isPart('ace', 15)).toBe(true);
      expect(isPart('ace', 30)).toBe(false);
    });

    it('takes the data and the stacked cards on the first board, and leaves what stands on a table', () => {
      const isPart = replayPartJudge(
        [],
        [
          { identifier: 'table', aliasName: 'game-table', syncData: {} },
          { identifier: 'wall', aliasName: 'terrain', syncData: { parentIdentifier: 'table' } },
          { identifier: 'deck', aliasName: 'card-stack', syncData: {} },
          { identifier: 'deck-root', aliasName: 'node', syncData: { parentIdentifier: 'deck' } },
          { identifier: 'ace', aliasName: 'card', syncData: { parentIdentifier: 'deck-root' } },
          { identifier: 'hp', aliasName: 'data', syncData: { parentIdentifier: 'hero' } },
        ]
      );

      expect(['table', 'wall', 'deck', 'ace', 'hp'].filter((identifier) => isPart(identifier, 1))).toEqual([
        'ace',
        'hp',
      ]);
    });

    it('lets what the manifest follows overrule the first board', () => {
      const isPart = replayPartJudge(
        [{ identifier: 'ace', aliasName: 'card', name: 'A', sinceSeq: 8 }],
        [
          { identifier: 'deck', aliasName: 'card-stack', syncData: {} },
          { identifier: 'deck-root', aliasName: 'node', syncData: { parentIdentifier: 'deck' } },
          { identifier: 'ace', aliasName: 'card', syncData: { parentIdentifier: 'deck-root' } },
        ]
      );

      expect(isPart('ace', 3)).toBe(true);
      expect(isPart('ace', 9)).toBe(false);
    });
  });

  it('flags only the arrivals and removals of parts', () => {
    const events = [
      event(ReplayEventKind.ObjectCreate, {}, 'hp'),
      event(ReplayEventKind.ObjectValue, { name: 'HP' }, 'hp'),
      event(ReplayEventKind.ObjectCreate, {}, 'hero'),
    ];

    const flagged = flagReplayParts(events, (identifier) => identifier === 'hp');

    expect(flagged.map((e) => e.detail[REPLAY_PART_FLAG] === true)).toEqual([true, false, false]);
    expect(flagged[1]).toBe(events[1]);
  });

  it('leaves the removal of a card drawn from its deck told, however long it once lay there', () => {
    const isPart = replayPartJudge(
      [
        { identifier: 'ace', aliasName: 'card', name: 'A', sinceSeq: 1 },
        { identifier: 'ace', aliasName: 'card', name: 'A', ownerIdentifier: 'deck', sinceSeq: 10 },
        { identifier: 'ace', aliasName: 'card', name: 'A', sinceSeq: 20 },
      ],
      []
    );

    const [removal] = flagReplayParts([event(ReplayEventKind.ObjectRemove, {}, 'ace', 30)], isPart);

    expect(replayEventCategory(removal)).toBe('board');
  });

  it('leaves one arrival per piece brought out in a recording written the old way', () => {
    const fixture = buildLongReplayFixture(SHORT_SESSION);
    const isPart = replayPartJudge(fixture.manifest.targets, fixture.keyframes[0].objects);

    const shown = flagReplayParts(fixture.events, isPart).filter(
      (e) => e.kind === ReplayEventKind.ObjectCreate && replayEventCategory(e) !== 'hidden'
    );

    expect(shown).toHaveLength(SHORT_SESSION.characters);
  });
});
