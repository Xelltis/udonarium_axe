import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { lightSourcesOn } from '@axe/domain/tabletop/table-lights';

describe('lightSourcesOn()', () => {
  const made: { destroy: () => void }[] = [];

  function table(identifier: string): GameTable {
    const created = new GameTable(identifier);
    created.initialize();
    made.push(created);
    return created;
  }

  function light(identifier: string, standingOn?: GameTable): LightSource {
    const created = new LightSource(identifier);
    created.initialize();
    created.location.name = 'table';
    if (standingOn) standingOn.appendChild(created);
    made.push(created);
    return created;
  }

  afterEach(() => {
    for (const object of made.splice(0)) object.destroy();
  });

  it('shows the lights standing on the table being looked at', () => {
    const here = table('table-here');
    const mine = light('light-mine', here);

    expect(lightSourcesOn(here)).toEqual([mine]);
  });

  it('leaves the lights of another table on that table', () => {
    const here = table('table-here');
    const elsewhere = table('table-elsewhere');
    light('light-elsewhere', elsewhere);

    expect(lightSourcesOn(here)).toEqual([]);
  });

  /**
   * A light used to sit outside any table, the way a piece still does, so a room saved then
   * carries lights with no table over them. They are shown wherever the reader is looking,
   * which is what they did when they were saved.
   */
  it('carries a light saved before lights belonged to a table onto every table', () => {
    const here = table('table-here');
    const there = table('table-there');
    const old = light('light-from-an-old-save');
    ObjectStore.instance.add(old);

    expect(lightSourcesOn(here)).toContain(old);
    expect(lightSourcesOn(there)).toContain(old);
    expect(lightSourcesOn(null)).toContain(old);
  });

  it('leaves out a light that is not standing on the table at all', () => {
    const here = table('table-here');
    const put = light('light-in-a-bag', here);
    put.location.name = 'somewhere-else';

    expect(lightSourcesOn(here)).toEqual([]);
  });
});
