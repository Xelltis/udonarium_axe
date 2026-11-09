import { UnusedSince } from '@axe/infrastructure/table-3d/unused-since';

describe('UnusedSince', () => {
  it('answers a thing once it has gone unused for as long as it is kept, and only once', () => {
    const unused = new UnusedSince(1000);
    unused.note(['knight', 'orc'], new Set(['orc']), 0);

    expect(unused.takeDue(999)).toEqual([]);
    expect(unused.takeDue(1000)).toEqual(['knight']);
    expect(unused.takeDue(5000)).toEqual([]);
  });

  it('keeps a thing used again before then as though it had never gone unused', () => {
    const unused = new UnusedSince(1000);
    unused.note(['knight'], new Set(), 0);
    unused.note(['knight'], new Set(['knight']), 500);
    unused.note(['knight'], new Set(), 800);

    expect(unused.takeDue(1500)).toEqual([]);
    expect(unused.takeDue(1800)).toEqual(['knight']);
  });

  it('counts from when a thing first went unused, however often it is noted unused since', () => {
    const unused = new UnusedSince(1000);
    unused.note(['knight'], new Set(), 0);
    unused.note(['knight'], new Set(), 900);

    expect(unused.takeDue(1000)).toEqual(['knight']);
  });

  it('forgets a thing no longer read', () => {
    const unused = new UnusedSince(1000);
    unused.note(['knight'], new Set(), 0);
    unused.note([], new Set(), 10);

    expect(unused.takeDue(2000)).toEqual([]);
    expect(unused.nextDueIn(2000)).toBeNull();
  });

  it('tells how long until the next thing is due, and nothing while all are used', () => {
    const unused = new UnusedSince(1000);
    expect(unused.nextDueIn(0)).toBeNull();

    unused.note(['knight'], new Set(), 100);
    unused.note(['knight', 'orc'], new Set(), 400);

    expect(unused.nextDueIn(600)).toBe(500);
    expect(unused.nextDueIn(5000)).toBe(0);
  });
});
