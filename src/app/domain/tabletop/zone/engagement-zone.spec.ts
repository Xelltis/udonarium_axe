import { TestBed } from '@angular/core/testing';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { EngagementZone, zonesOn } from '@axe/domain/tabletop/zone/engagement-zone';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('EngagementZone', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] }));

  it('has no centre until one is written, rather than standing at the origin', () => {
    const zone = new EngagementZone();

    expect(zone.centre).toBeNull();
    zone.centre = { x: 120, y: 80.5 };
    expect(zone.centre).toEqual({ x: 120, y: 80.5 });
  });

  it('reads a centre written as text it cannot read as none', () => {
    const zone = new EngagementZone();
    zone.centreX = '12';
    zone.centreY = 'abc';

    expect(zone.centre).toBeNull();
  });

  it('holds as many as the table allows until given a limit of one or more', () => {
    const zone = new EngagementZone();

    expect(zone.limit).toBeNull();
    zone.capacity = '0';
    expect(zone.limit).toBeNull();
    zone.capacity = '6';
    expect(zone.limit).toBe(6);
  });

  it('is a circle in force until said to be square or still forming', () => {
    const zone = new EngagementZone();

    expect(zone.isSquare).toBe(false);
    expect(zone.isForming).toBe(false);
    zone.shape = 'square';
    zone.forming = '1';
    expect(zone.isSquare).toBe(true);
    expect(zone.isForming).toBe(true);
  });

  it("is found among a table's children", () => {
    const table = new GameTable('zone-table');
    table.initialize();
    const zone = new EngagementZone('zone-1');
    zone.initialize();
    table.appendChild(zone);

    expect(zonesOn(table)).toEqual([zone]);
    expect(zonesOn(null)).toEqual([]);
    table.destroy();
  });
});
