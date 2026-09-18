import {
  GM_ONLY_VISIBILITY,
  PUBLIC_VISIBILITY,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayTargetSnapshot,
  type ReplayVisibility,
} from '@axe/domain/replay/replay-event';
import { hiddenPiecesIn, inheritOwnerVisibility, visibilityOfDisclosure } from '@axe/domain/replay/replay-visibility';
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
