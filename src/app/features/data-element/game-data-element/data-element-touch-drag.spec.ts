import { pickDropRow } from '@axe/features/data-element/game-data-element/data-element-touch-drag';

const rows = [
  { id: 'a', top: 0, height: 40 },
  { id: 'b', top: 40, height: 40 },
  { id: 'c', top: 80, height: 40 },
  { id: 'd', top: 120, height: 40 },
];

describe('pickDropRow', () => {
  it('lands above the first row whose middle is still below the finger', () => {
    expect(pickDropRow(rows, 'a', 85)).toEqual({ id: 'c', side: 'before' });
    expect(pickDropRow(rows, 'a', 110)).toEqual({ id: 'd', side: 'before' });
  });

  it('lands above the first row from above it, and below the last from below it', () => {
    expect(pickDropRow(rows, 'c', -30)).toEqual({ id: 'a', side: 'before' });
    expect(pickDropRow(rows, 'b', 400)).toEqual({ id: 'd', side: 'after' });
  });

  it('lands nowhere over the row being dragged', () => {
    expect(pickDropRow(rows, 'b', 45)).toBeNull();
    expect(pickDropRow(rows, 'b', 75)).toBeNull();
  });

  it('lands nowhere just beside the row being dragged, where it already is', () => {
    expect(pickDropRow(rows, 'b', 85)).toBeNull();
    expect(pickDropRow(rows, 'b', 35)).toBeNull();
  });

  it('lands nowhere without rows', () => {
    expect(pickDropRow([], 'a', 10)).toBeNull();
  });
});
