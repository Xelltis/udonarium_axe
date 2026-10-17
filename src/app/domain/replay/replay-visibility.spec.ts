import {
  GM_ONLY_VISIBILITY,
  PLAYERS_VISIBILITY,
  PUBLIC_VISIBILITY,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayTargetSnapshot,
  type ReplayVisibility,
} from '@axe/domain/replay/replay-event';
import {
  hiddenPiecesIn,
  inheritOwnerVisibility,
  keepOlderLinesAsSeen,
  visibilityOfChatLine,
  visibilityOfDisclosure,
} from '@axe/domain/replay/replay-visibility';
import { buildLongReplayFixture, SHORT_SESSION } from '@axe/testing/replay-fixtures';

function event(seq: number, kind: ReplayEventKind, targetId: string, visibility: ReplayVisibility): ReplayEvent {
  return { seq, at: seq, t: seq, kind, actorId: 'gm', targetId, detail: {}, visibility };
}

const TARGETS: ReplayTargetSnapshot[] = [
  { identifier: 'boss', aliasName: 'character', name: 'ボス', sinceSeq: 0 },
  { identifier: 'boss-hp', aliasName: 'data', name: 'HP', ownerIdentifier: 'boss', sinceSeq: 0 },
];

describe('replay visibility', () => {
  describe('visibilityOfDisclosure', () => {
    it('reads the three disclosures', () => {
      expect(visibilityOfDisclosure('gm', [])).toEqual(GM_ONLY_VISIBILITY);
      expect(visibilityOfDisclosure('selected', ['alice'])).toEqual({ kind: 'direct', to: ['alice'] });
      expect(visibilityOfDisclosure('all', [])).toEqual(PUBLIC_VISIBILITY);
    });

    it('reads a missing or unknown disclosure as public', () => {
      expect(visibilityOfDisclosure(undefined, undefined)).toEqual(PUBLIC_VISIBILITY);
      expect(visibilityOfDisclosure('selected', 'alice')).toEqual(PUBLIC_VISIBILITY);
    });
  });

  it('finds the hidden pieces on a board', () => {
    const hidden = hiddenPiecesIn([
      { identifier: 'boss', aliasName: 'character', syncData: { attributes: { disclosureMode: 'gm' } } },
      { identifier: 'hero', aliasName: 'character', syncData: { attributes: { disclosureMode: 'all' } } },
      { identifier: 'hp', aliasName: 'data', syncData: { value: 10 } },
    ]);

    expect([...hidden.keys()]).toEqual(['boss']);
  });

  describe('keepOlderLinesAsSeen', () => {
    const board = [
      { identifier: 'gm-tab', aliasName: 'chat-tab', syncData: { plCanView: false, guestCanView: false } },
      {
        identifier: 'pl-tab',
        aliasName: 'chat-tab',
        syncData: { attributes: { plCanView: true, guestCanView: 'false' } },
      },
      { identifier: 'main-tab', aliasName: 'chat-tab', syncData: {} },
    ];
    const line = (
      seq: number,
      tabIdentifier: string,
      visibility: ReplayVisibility = PUBLIC_VISIBILITY
    ): ReplayEvent => ({
      ...event(seq, ReplayEventKind.ChatMessage, `line-${seq}`, visibility),
      detail: { tabIdentifier },
    });

    it('keeps each line to those who could read its tab as the board began', () => {
      const events = [line(1, 'gm-tab'), line(2, 'pl-tab'), line(3, 'main-tab'), line(4, 'made-later')];

      expect(keepOlderLinesAsSeen(events, board).map((e) => e.visibility)).toEqual([
        GM_ONLY_VISIBILITY,
        PLAYERS_VISIBILITY,
        PUBLIC_VISIBILITY,
        PUBLIC_VISIBILITY,
      ]);
    });

    it('keeps a secret roll whispered to somebody to its roller and the GM', () => {
      const whispered = {
        ...line(1, 'main-tab', { kind: 'direct', to: ['bob', 'alice'] }),
        detail: { tabIdentifier: 'main-tab', to: 'bob alice', tag: 'DiceBot secret' },
      };

      expect(keepOlderLinesAsSeen([whispered], board)[0].visibility).toEqual({ kind: 'direct', to: [] });
    });

    it('leaves alone a whisper, and what is not a line', () => {
      const whisper = {
        ...line(1, 'gm-tab', { kind: 'direct', to: ['bob'] }),
        detail: { tabIdentifier: 'gm-tab', to: 'bob' },
      };
      const move = {
        ...event(2, ReplayEventKind.ObjectMove, 'piece', PUBLIC_VISIBILITY),
        detail: { tabIdentifier: 'gm-tab' },
      };

      expect(keepOlderLinesAsSeen([whisper, move], board)).toEqual([whisper, move]);
    });
  });

  describe('visibilityOfChatLine', () => {
    const open = { plCanView: true, guestCanView: true };

    it('keeps a whisper to those it was said to, and a secret roll to its roller and the GM', () => {
      expect(visibilityOfChatLine({ to: 'bob carol', tag: '' }, open)).toEqual({
        kind: 'direct',
        to: ['bob', 'carol'],
      });
      expect(visibilityOfChatLine({ to: '', tag: 'secret' }, open)).toEqual({ kind: 'direct', to: [] });
    });

    it('keeps a secret roll whispered to somebody from the one it was whispered to, as its words were', () => {
      expect(visibilityOfChatLine({ to: 'bob alice', tag: 'secret' }, open)).toEqual({ kind: 'direct', to: [] });
    });

    it('keeps a line to those who may read its tab', () => {
      expect(visibilityOfChatLine({ to: '', tag: '' }, open)).toEqual(PUBLIC_VISIBILITY);
      expect(visibilityOfChatLine({ to: '', tag: '' }, { plCanView: false, guestCanView: false })).toEqual(
        GM_ONLY_VISIBILITY
      );
      expect(visibilityOfChatLine({ to: '', tag: '' }, { plCanView: true, guestCanView: false })).toEqual(
        PLAYERS_VISIBILITY
      );
      expect(visibilityOfChatLine({ to: '', tag: '' }, null)).toEqual(PUBLIC_VISIBILITY);
    });
  });

  describe('inheritOwnerVisibility', () => {
    it('hides a part of a piece that was hidden on the board it started from', () => {
      const events = [event(1, ReplayEventKind.ObjectValue, 'boss-hp', PUBLIC_VISIBILITY)];

      const [fixed] = inheritOwnerVisibility(events, TARGETS, new Map([['boss', GM_ONLY_VISIBILITY]]));

      expect(fixed.visibility).toEqual(GM_ONLY_VISIBILITY);
    });

    it('follows the owner’s own events once they say it was hidden', () => {
      const events = [
        event(1, ReplayEventKind.ObjectValue, 'boss-hp', PUBLIC_VISIBILITY),
        event(2, ReplayEventKind.ObjectMove, 'boss', GM_ONLY_VISIBILITY),
        event(3, ReplayEventKind.ObjectValue, 'boss-hp', PUBLIC_VISIBILITY),
      ];

      const fixed = inheritOwnerVisibility(events, TARGETS, new Map());

      expect(fixed.map((e) => e.visibility.kind)).toEqual(['public', 'gm-only', 'gm-only']);
    });

    it('lets the parts show again once the owner is shown', () => {
      const events = [
        event(1, ReplayEventKind.ObjectMove, 'boss', PUBLIC_VISIBILITY),
        event(2, ReplayEventKind.ObjectValue, 'boss-hp', PUBLIC_VISIBILITY),
      ];

      const fixed = inheritOwnerVisibility(events, TARGETS, new Map([['boss', GM_ONLY_VISIBILITY]]));

      expect(fixed[1].visibility).toEqual(PUBLIC_VISIBILITY);
    });

    it('does not take a turn that names the owner for the owner’s own state', () => {
      const events = [
        event(1, ReplayEventKind.TurnChange, 'boss', PUBLIC_VISIBILITY),
        event(2, ReplayEventKind.ObjectValue, 'boss-hp', PUBLIC_VISIBILITY),
      ];

      const fixed = inheritOwnerVisibility(events, TARGETS, new Map([['boss', GM_ONLY_VISIBILITY]]));

      expect(fixed[0].visibility).toEqual(PUBLIC_VISIBILITY);
      expect(fixed[1].visibility).toEqual(GM_ONLY_VISIBILITY);
    });

    it('never shows an event to more people than it was recorded for', () => {
      const whisper: ReplayVisibility = { kind: 'direct', to: ['alice'] };
      const events = [event(1, ReplayEventKind.ObjectValue, 'boss-hp', whisper)];

      const [fixed] = inheritOwnerVisibility(events, TARGETS, new Map());

      expect(fixed.visibility).toEqual(whisper);
    });

    it('hides the values of the hidden pieces in a recording written the old way', () => {
      const fixture = buildLongReplayFixture(SHORT_SESSION);

      const fixed = inheritOwnerVisibility(
        fixture.events,
        fixture.manifest.targets,
        hiddenPiecesIn(fixture.keyframes[0].objects)
      );

      const values = fixed.filter((e) => e.targetId?.startsWith('pc-0-'));
      expect(values.length).toBeGreaterThan(0);
      expect(values.every((e) => e.visibility.kind === 'gm-only')).toBe(true);
      const others = fixed.filter((e) => e.targetId?.startsWith(`pc-${SHORT_SESSION.characters - 1}-`));
      expect(others.every((e) => e.visibility.kind === 'public')).toBe(true);
    });
  });
});
