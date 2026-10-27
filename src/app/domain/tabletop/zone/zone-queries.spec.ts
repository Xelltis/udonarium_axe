import { GameTable } from '@axe/domain/tabletop/game-table';
import {
  mayMoveByZones,
  zoneInterrupters,
  zoneMoveLimits,
  zoneMoveOutcome,
  ZoneMoveStart,
  ZoneSnapshot,
} from '@axe/domain/tabletop/zone/zone-queries';
import { resolveZoneRules } from '@axe/domain/tabletop/zone/zone-rules';
import { ZoneInput, ZonePieceInput, zoneStateOf } from '@axe/domain/tabletop/zone/zone-state';

/** Fifty pixels a metre, as a table of fifty-pixel cells a metre across. */
const M = 50;

const rules = resolveZoneRules({ enabled: true, sizes: '5:3:5,10:4:7,20:6:10' });

function zone(id: string, x: number, y: number): ZoneInput {
  return { id, centre: { x: x * M, y: y * M }, limit: null, square: false, forming: false };
}

function piece(id: string, x: number, y: number, more: Partial<ZonePieceInput> = {}): ZonePieceInput {
  return { id, point: { x: x * M, y: y * M }, zone: '', offField: false, count: 1, side: 'pc', ...more };
}

/** A fight at (10, 10): one of the mover's side against two of the other, which a zone keeps going. */
function foes(): ZonePieceInput[] {
  return [
    piece('ally', 10, 10, { zone: 'z1' }),
    piece('n1', 10, 10, { zone: 'z1', side: 'npc' }),
    piece('n2', 10, 10, { zone: 'z1', side: 'npc' }),
  ];
}

function snapshotOf(zones: ZoneInput[], pieces: ZonePieceInput[], more: Partial<ZoneSnapshot> = {}): ZoneSnapshot {
  return {
    world: { table: {} as GameTable, rules, pxPerMetre: M, snap: (point) => point },
    pieces,
    state: zoneStateOf({ zones, pieces, rules, pxPerMetre: M }),
    front: new Map(),
    carried: new Set(),
    leaveRounds: new Map(),
    unseen: new Set(),
    unstoppable: new Set(),
    turn: { round: 1, roundsKept: true },
    stopsByChoice: false,
    ...more,
  };
}

describe('zone queries', () => {
  describe('the limits zones put on a move', () => {
    it('end a move walking into a zone the other side holds', () => {
      const snapshot = snapshotOf([zone('z1', 10, 10)], [piece('a', 0, 0), ...foes()]);

      const limits = zoneMoveLimits(snapshot, 'a', '')!;

      expect(limits.noReach).toBe(false);
      expect(limits.stops).toEqual([snapshot.state.zones[0].shape]);
    });

    it('end nothing of themselves where the side chooses, or where nobody may stop the piece', () => {
      const zones = [zone('z1', 10, 10)];
      const pieces = [piece('a', 0, 0), ...foes()];

      expect(zoneMoveLimits(snapshotOf(zones, pieces, { stopsByChoice: true }), 'a', '')!.stops).toEqual([]);
      expect(zoneMoveLimits(snapshotOf(zones, pieces, { unstoppable: new Set(['a']) }), 'a', '')!.stops).toEqual([]);
    });

    it('let a piece that is down, held fast or held on to go nowhere', () => {
      for (const more of [{ down: true }, { held: true }, { grabbedBy: 'n1' }]) {
        expect(zoneMoveLimits(snapshotOf([], [piece('a', 0, 0, more)]), 'a', '')!.noReach).toBe(true);
      }
    });

    it('say nothing of a piece on no side or off the field', () => {
      expect(zoneMoveLimits(snapshotOf([], [piece('a', 0, 0, { side: null })]), 'a', '')).toBeNull();
      expect(zoneMoveLimits(snapshotOf([], [piece('a', 0, 0, { offField: true })]), 'a', '')).toBeNull();
    });
  });

  describe('whether zones let a piece move', () => {
    it('hold a piece in a zone the other side outnumbers it in, until it said in an earlier round it would leave', () => {
      const zones = [zone('z1', 10, 10)];
      const pieces = [piece('a', 10, 10, { zone: 'z1' }), ...foes()];

      expect(mayMoveByZones(snapshotOf(zones, pieces), 'a', '')).toBe(false);
      expect(mayMoveByZones(snapshotOf(zones, pieces, { leaveRounds: new Map([['a', '0']]) }), 'a', '')).toBe(true);
    });

    it('let anybody move where zones are not played', () => {
      expect(mayMoveByZones(null, 'a', '')).toBe(true);
    });
  });

  describe('what a move did among the zones', () => {
    const fresh: ZoneMoveStart = { zone: '', inside: [], kind: '' };

    it('has a piece that walked out of its zone leave it, and one still inside stay', () => {
      const snapshot = snapshotOf([zone('z1', 10, 10)], [piece('a', 10, 10, { zone: 'z1' }), ...foes()]);
      const start: ZoneMoveStart = { zone: 'z1', inside: [], kind: '' };

      expect(zoneMoveOutcome(snapshot, 'a', start, { x: 30 * M, y: 30 * M }, false)).toEqual({ kind: 'left' });
      expect(zoneMoveOutcome(snapshot, 'a', start, { x: 10 * M, y: 10 * M }, false)).toEqual({ kind: 'stay' });
    });

    it('holds a piece that walked into a zone the other side holds', () => {
      const snapshot = snapshotOf([zone('z1', 10, 10)], [piece('a', 0, 0), ...foes()]);

      const outcome = zoneMoveOutcome(snapshot, 'a', fresh, { x: 10 * M, y: 10 * M }, false);

      expect(outcome.kind).toBe('held');
      expect(outcome.kind === 'held' && outcome.zone.id).toBe('z1');
    });

    it('lets by a piece nobody may stop, which lets go of its word to leave the zone it walked out of', () => {
      const snapshot = snapshotOf([zone('z1', 10, 10)], [piece('a', 10, 10), ...foes()], {
        leaveRounds: new Map([['a', '1']]),
      });
      const start: ZoneMoveStart = { zone: '', inside: ['z1'], kind: '' };

      expect(zoneMoveOutcome(snapshot, 'a', start, { x: 30 * M, y: 30 * M }, true)).toEqual({ kind: 'forgetLeave' });
    });
  });

  describe('who may stop a move', () => {
    it('names the pieces of the other side in a zone that would hold the mover', () => {
      const snapshot = snapshotOf([zone('z1', 10, 10)], [piece('a', 0, 0), ...foes()]);

      const interrupters = zoneInterrupters(snapshot, 'a', '')!;

      expect(interrupters.holding.map((hold) => hold.id)).toEqual(['z1']);
      expect(interrupters.holding[0].members.map((member) => member.id)).toEqual(['n1', 'n2']);
      expect(interrupters.unstoppable).toBe(false);
    });
  });
});
