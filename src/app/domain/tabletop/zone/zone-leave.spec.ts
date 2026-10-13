import { LeaveInput, leaveReasonOf, zoneHolds, ZoneSideCounts } from '@axe/domain/tabletop/zone/zone-leave';

function counts(members: Record<string, number>, inside: Record<string, number> = {}): ZoneSideCounts {
  return { members: new Map(Object.entries(members)), inside: new Map(Object.entries(inside)) };
}

describe('zoneHolds', () => {
  it('lets a piece walk through where its side, itself included, outnumbers the rest by the ratio', () => {
    expect(zoneHolds(counts({ pc: 4, npc: 2 }), { side: 'pc', count: 1 }, 'pass', 2)).toBe(false);
    expect(zoneHolds(counts({ pc: 3, npc: 2 }), { side: 'pc', count: 1 }, 'pass', 2)).toBe(true);
  });

  it('counts the other side standing in the zone without being in it', () => {
    expect(zoneHolds(counts({ pc: 4, npc: 1 }, { npc: 1 }), { side: 'pc', count: 1 }, 'escape', 2)).toBe(false);
    expect(zoneHolds(counts({ pc: 3, npc: 1 }, { npc: 1, pc: 9 }), { side: 'pc', count: 1 }, 'escape', 2)).toBe(true);
  });

  it('leaves the piece itself out of its side when it leaves a zone it is in', () => {
    expect(zoneHolds(counts({ pc: 3, npc: 1 }), { side: 'pc', count: 1 }, 'leave', 2)).toBe(true);
    expect(zoneHolds(counts({ pc: 4, npc: 1 }), { side: 'pc', count: 1 }, 'leave', 2)).toBe(false);
  });
});

describe('leaveReasonOf', () => {
  const held: LeaveInput = {
    counts: counts({ pc: 1, npc: 1 }),
    mover: { side: 'pc', count: 1 },
    ratio: 2,
    overflowing: false,
    leaveRound: '',
    round: 3,
    roundsKept: true,
    leaveKind: '',
    kind: '',
  };

  it('holds a piece that neither said it would leave nor outnumbers the rest', () => {
    expect(leaveReasonOf(held)).toBe('held');
  });

  it('lets a piece go that said it would leave in an earlier round, and not one that said so this round', () => {
    expect(leaveReasonOf({ ...held, leaveRound: '2' })).toBe('prepared');
    expect(leaveReasonOf({ ...held, leaveRound: '3' })).toBe('held');
  });

  it('lets a piece go on its next move where no round is being kept', () => {
    expect(leaveReasonOf({ ...held, leaveRound: '0', roundsKept: false })).toBe('prepared');
  });

  it('lets a piece go whose side outnumbers the rest', () => {
    expect(leaveReasonOf({ ...held, counts: counts({ pc: 4, npc: 1 }) })).toBe('outnumbers');
  });

  it('lets a piece out of an overflowing zone at once by the named kind alone', () => {
    expect(leaveReasonOf({ ...held, overflowing: true, leaveKind: '駆け足', kind: '駆け足' })).toBe('overflow');
    expect(leaveReasonOf({ ...held, overflowing: true, leaveKind: '駆け足', kind: '歩き', leaveRound: '1' })).toBe(
      'held'
    );
    expect(leaveReasonOf({ ...held, overflowing: true })).toBe('overflow');
  });
});
