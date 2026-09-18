import { PUBLIC_VISIBILITY, type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import {
  flagReplayParts,
  REPLAY_PART_FLAG,
  replayEventCategory,
  replayPartIdentifiers,
} from '@axe/domain/replay/replay-event-category';
import { buildLongReplayFixture, SHORT_SESSION } from '@axe/testing/replay-fixtures';

function event(kind: ReplayEventKind, detail: Record<string, unknown> = {}, targetId = 'piece'): ReplayEvent {
  return { seq: 1, at: 0, t: 0, kind, actorId: 'gm', targetId, detail, visibility: PUBLIC_VISIBILITY };
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
      const parts = replayPartIdentifiers(
        [
          { identifier: 'boss', aliasName: 'character', name: 'ボス', sinceSeq: 0 },
          { identifier: 'boss-hp', aliasName: 'data', name: 'HP', ownerIdentifier: 'boss', sinceSeq: 0 },
        ],
        []
      );

      expect([...parts]).toEqual(['boss-hp']);
    });

    it('takes the data and the stacked cards on the first board, and leaves what stands on a table', () => {
      const parts = replayPartIdentifiers(
        [],
        [
          { identifier: 'table', aliasName: 'game-table', syncData: {} },
          { identifier: 'wall', aliasName: 'terrain', syncData: { parentIdentifier: 'table' } },
          { identifier: 'deck', aliasName: 'card-stack', syncData: {} },
          { identifier: 'ace', aliasName: 'card', syncData: { parentIdentifier: 'deck' } },
          { identifier: 'hp', aliasName: 'data', syncData: { parentIdentifier: 'hero' } },
        ]
      );

      expect([...parts].sort()).toEqual(['ace', 'hp']);
    });
  });

  it('flags only the arrivals and removals of parts', () => {
    const events = [
      event(ReplayEventKind.ObjectCreate, {}, 'hp'),
      event(ReplayEventKind.ObjectValue, { name: 'HP' }, 'hp'),
      event(ReplayEventKind.ObjectCreate, {}, 'hero'),
    ];

    const flagged = flagReplayParts(events, new Set(['hp']));

    expect(flagged.map((e) => e.detail[REPLAY_PART_FLAG] === true)).toEqual([true, false, false]);
    expect(flagged[1]).toBe(events[1]);
  });

  it('leaves one arrival per piece brought out in a recording written the old way', () => {
    const fixture = buildLongReplayFixture(SHORT_SESSION);
    const parts = replayPartIdentifiers(fixture.manifest.targets, fixture.keyframes[0].objects);

    const shown = flagReplayParts(fixture.events, parts).filter(
      (e) => e.kind === ReplayEventKind.ObjectCreate && replayEventCategory(e) !== 'hidden'
    );

    expect(shown).toHaveLength(SHORT_SESSION.characters);
  });
});
