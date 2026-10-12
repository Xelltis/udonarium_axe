import type { FreePlan } from '@axe/application/tabletop/free-move-plan.service';
import {
  freePathOverlayModelOf,
  parseMovingPoints,
} from '@axe/features/tabletop/table-free-path-overlay/free-path-overlay-model';

function plan(more: Partial<FreePlan> = {}): FreePlan {
  return {
    characterIdentifier: 'piece',
    origin: { x: 0, y: 0, z: 0 },
    settled: [
      { x: 10, y: 10 },
      { x: 60, y: 10 },
    ],
    ahead: [
      { x: 60, y: 10 },
      { x: 60, y: 40 },
    ],
    spentPx: 50,
    budgetPx: 150,
    pxPerMetre: 50,
    kind: '',
    ended: false,
    unstoppable: false,
    ...more,
  };
}

describe('freePathOverlayModelOf', () => {
  it('draws the settled legs, the leg ahead and what the move still reaches from the last corner', () => {
    expect(freePathOverlayModelOf(plan(), []).own).toEqual({
      settled: '10,10 60,10',
      ahead: '60,10 60,40',
      reach: { cx: 60, cy: 10, r: 100 },
    });
  });

  it('draws no reach once a zone has ended the move, nor a leg ahead where none is drawn', () => {
    const own = freePathOverlayModelOf(plan({ ended: true, ahead: [] }), []).own!;

    expect(own.reach).toBeNull();
    expect(own.ahead).toBeNull();
  });

  it("draws the other peers' ways, leaving out what cannot be read", () => {
    expect(freePathOverlayModelOf(null, ['1,2 3,4', '5,6', 'x,y 1,1', '']).others).toEqual(['1,2 3,4']);
  });
});

describe('parseMovingPoints', () => {
  it('reads points joined by spaces, and nothing where fewer than two can be read', () => {
    expect(parseMovingPoints(' 10,20  30,40 ')).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(parseMovingPoints('10,20')).toEqual([]);
  });
});
