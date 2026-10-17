import {
  carriesWithheldInto,
  isTableWithheld,
  markLoadedWithheld,
  markSeatWithheld,
} from '@axe/domain/peer/withheld-table';

describe('withheld table', () => {
  afterEach(() => markLoadedWithheld(false, false));

  it('takes nothing withheld anywhere from a whole table', () => {
    expect(isTableWithheld()).toBe(false);
    expect(carriesWithheldInto('room-a')).toBe(false);
    expect(carriesWithheldInto(null)).toBe(false);
  });

  it('takes what a seat was handed withheld into any room but the one it was handed it in', () => {
    markSeatWithheld(true, 'room-a');

    expect(carriesWithheldInto('room-a')).toBe(false);
    expect(carriesWithheldInto('room-b')).toBe(true);
    expect(carriesWithheldInto(null)).toBe(true);
  });

  it('takes what a marked save brought in into every room', () => {
    markLoadedWithheld(true, false);

    expect(carriesWithheldInto('room-a')).toBe(true);
    expect(carriesWithheldInto(null)).toBe(true);
  });

  it('puts a seat right only as the GM of the room it was withheld in', () => {
    markSeatWithheld(true, 'room-a');
    markSeatWithheld(false, 'room-b');
    expect(isTableWithheld()).toBe(true);

    markSeatWithheld(false, 'room-a');
    expect(isTableWithheld()).toBe(false);
  });
});
