import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { EngagementZoneService, metresPerCell } from '@axe/application/tabletop/engagement-zone.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { cellGridOf, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { EngagementZone, zonesOn } from '@axe/domain/tabletop/zone/engagement-zone';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

describe('EngagementZoneService', () => {
  let service: EngagementZoneService;
  let table: GameTable;
  let said: string[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    Config.instance.zoneEnabled = true;
    table = new GameTable();
    table.width = 30;
    table.height = 30;
    table.gridSize = GRID;
    table.initialize();
    service = TestBed.inject(EngagementZoneService);
    said = [];
    vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage').mockImplementation((text: string) => {
      said.push(text);
      return null as never;
    });
  });

  afterEach(() => {
    Config.instance.zoneEnabled = null;
    Config.instance.zoneCountField = null;
    Config.instance.moveKinds = null;
    Config.instance.zoneLeaveKind = null;
    Config.instance.zoneOutnumber = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(col: number, row: number, npc = false): GameCharacter {
    const piece = GameCharacter.create(npc ? '敵' : '味方', 1, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    piece.isNpc = npc;
    return piece;
  }

  it('makes a zone at the second piece, puts both in it, and gathers them about its centre', () => {
    const hero = pieceAt(10, 10);
    const foe = pieceAt(10, 10, true);

    const zone = service.declare(hero, foe)!;

    expect(zonesOn(table)).toEqual([zone]);
    expect(zone.centre).toEqual({ x: 10.5 * GRID, y: 10.5 * GRID });
    expect(hero.engagementZone).toBe(zone.identifier);
    expect(foe.engagementZone).toBe(zone.identifier);
    expect([hero.location.x, hero.location.y]).not.toEqual([foe.location.x, foe.location.y]);
    expect(service.stateNow().zones[0].members).toHaveLength(2);
    expect(said).toHaveLength(1);
  });

  it('puts a piece into the zone the other is already in rather than making another', () => {
    const hero = pieceAt(10, 10);
    const foe = pieceAt(10, 10, true);
    const zone = service.declare(hero, foe)!;
    const friend = pieceAt(11, 10);

    expect(service.declare(friend, foe)).toBe(zone);
    expect(zonesOn(table)).toHaveLength(1);
    expect(friend.engagementZone).toBe(zone.identifier);
  });

  it('ends the zone when the last of one side leaves it', () => {
    const hero = pieceAt(10, 10);
    const foe = pieceAt(10, 10, true);
    service.declare(hero, foe);

    service.leave(foe);

    expect(zonesOn(table)).toEqual([]);
    expect(hero.engagementZone).toBe('');
  });

  it('joins a zone declared within reach of another into it, half way between', () => {
    service.declare(pieceAt(10, 10), pieceAt(10, 10, true));
    service.declare(pieceAt(12, 10), pieceAt(12, 10, true));

    expect(zonesOn(table)).toHaveLength(1);
    expect(zonesOn(table)[0].centre).toEqual({ x: 11.5 * GRID, y: 10.5 * GRID });
    expect(service.stateNow().zones[0].members).toHaveLength(4);
  });

  it('takes a piece out of the fight, and out of its zone with it', () => {
    const hero = pieceAt(10, 10);
    const foe = pieceAt(10, 10, true);
    const ally = pieceAt(10, 10);
    const zone = service.declare(hero, foe)!;
    service.join(ally, zone.identifier);

    service.toggleOffField(ally);

    expect(ally.offField).toBe('1');
    expect(ally.engagementZone).toBe('');
    service.toggleOffField(ally);
    expect(ally.offField).toBe('');
  });

  it('counts a piece by the field the room names', () => {
    Config.instance.zoneCountField = '体数';
    const hero = pieceAt(10, 10);
    const giant = pieceAt(10, 10, true);
    giant.rootDataElement!.appendChild(DataElement.create('体数', 5, {}, '体数' + giant.identifier));

    service.declare(hero, giant);

    expect(service.stateNow().zones[0].count).toBe(6);
  });

  it('does nothing where the room does not play zones', () => {
    Config.instance.zoneEnabled = null;

    expect(service.declare(pieceAt(10, 10), pieceAt(10, 10, true))).toBeNull();
    expect(service.stateNow().zones).toEqual([]);
  });

  describe("what a piece's menu offers", () => {
    it('offers a fight with an enemy at the same point, and none with a friend or one further off', () => {
      const hero = pieceAt(10, 10);
      const foe = pieceAt(10, 10, true);
      pieceAt(10, 10);
      pieceAt(14, 10, true);

      const menu = service.menuOf(hero);

      expect(menu.enabled).toBe(true);
      expect(menu.foes).toEqual([{ id: foe.identifier, name: '敵' }]);
      expect(menu.zone).toBeNull();
    });

    it('offers joining a zone the piece stands in, and its own zone once it is in one', () => {
      const hero = pieceAt(10, 10);
      const foe = pieceAt(10, 10, true);
      const zone = service.declare(hero, foe)!;
      const friend = pieceAt(11, 10);

      expect(service.menuOf(friend).joinable).toEqual([zone.identifier]);
      expect(service.menuOf(hero)).toMatchObject({
        zone: { id: zone.identifier, square: false, limit: null },
        foes: [],
      });
    });

    it('offers nothing where the room does not play zones', () => {
      Config.instance.zoneEnabled = null;

      expect(service.menuOf(pieceAt(10, 10)).enabled).toBe(false);
    });
  });

  describe('what zones make of a move', () => {
    const grid = () => cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const cellOf = (col: number, row: number) => cellIndexAt(grid(), (col + 0.5) * GRID, (row + 0.5) * GRID);

    function fight(): { hero: GameCharacter; foe: GameCharacter; zone: EngagementZone } {
      const hero = pieceAt(10, 10);
      const foe = pieceAt(10, 10, true);
      const zone = service.declare(hero, foe)!;
      return { hero, foe, zone };
    }

    it('holds a piece in its zone until it says it will leave, and starts its move at the centre', () => {
      const { hero, zone } = fight();

      expect(service.reachTermsFor(hero, grid(), '')).toEqual({
        startPoint: zone.centre,
        noReach: true,
        blocked: null,
        stops: null,
      });
      expect(service.mayMove(hero, '')).toBe(false);
      expect(service.kindFor(hero, '')).toBeNull();

      service.prepareLeave(hero);

      expect(hero.zoneLeaveRound).toBe('0');
      expect(service.mayMove(hero, '')).toBe(true);
      expect(service.reachTermsFor(hero, grid(), '')?.noReach).toBe(false);
      service.cancelLeave(hero);
      expect(service.mayMove(hero, '')).toBe(false);
    });

    it('lets a piece out of an overflowing zone by the one kind the room names, and picks that kind for it', () => {
      Config.instance.moveKinds = '全力:3:,通常:1:';
      Config.instance.zoneLeaveKind = '全力';
      const { hero, zone } = fight();
      service.join(pieceAt(10, 10), zone.identifier);
      service.setLimit(zone.identifier, 2);

      expect(service.stateNow().zones[0].overflowing).toBe(true);
      expect(service.mayMove(hero, '通常')).toBe(false);
      expect(service.mayMove(hero, '全力')).toBe(true);
      expect(service.kindFor(hero, '通常')).toBe('全力');
    });

    it('stops a piece walking into a zone its side does not outnumber, and shuts a full one to it', () => {
      const { zone } = fight();
      const walker = pieceAt(16, 10);

      const open = service.reachTermsFor(walker, grid(), '')!;
      expect(open.stops?.get(cellOf(10, 10))).toBe(true);
      expect(open.stops?.get(cellOf(16, 10))).toBe(false);
      expect(open.blocked).toBeNull();

      service.setLimit(zone.identifier, 2);

      const full = service.reachTermsFor(walker, grid(), '')!;
      expect(full.blocked?.get(cellOf(10, 10))).toBe(true);
      expect(full.stops).toBeNull();
    });

    it('stops a piece standing in a zone, without being in it, on its way out', () => {
      fight();
      const stander = pieceAt(11, 10);

      const terms = service.reachTermsFor(stander, grid(), '')!;

      expect(terms.startPoint).toBeNull();
      expect(terms.stops?.get(cellOf(16, 10))).toBe(true);
      expect(terms.stops?.get(cellOf(10, 10))).toBe(false);
    });

    it('lets a piece by where its side outnumbers the rest by the ratio the room sets', () => {
      Config.instance.zoneOutnumber = 0.5;
      fight();

      expect(service.reachTermsFor(pieceAt(16, 10), grid(), '')?.stops).toBeNull();
    });

    it('takes a piece that walked out of its zone out of it', () => {
      const { hero } = fight();
      service.prepareLeave(hero);
      const start = service.startOfMove(hero);
      said = [];

      hero.location = { name: 'table', x: 16 * GRID, y: 10 * GRID };
      service.afterMove(hero, start);

      expect(hero.engagementZone).toBe('');
      expect(hero.zoneLeaveRound).toBe('');
      expect(said).toHaveLength(1);
    });

    it('puts a piece that walked into a zone that holds it into that zone', () => {
      const { zone } = fight();
      const walker = pieceAt(16, 10);
      const start = service.startOfMove(walker);
      said = [];

      walker.location = { name: 'table', x: 11 * GRID, y: 10 * GRID };
      service.afterMove(walker, start);

      expect(walker.engagementZone).toBe(zone.identifier);
      expect(said).toHaveLength(1);
    });

    it('leaves a piece that walked past nothing as it was', () => {
      fight();
      const walker = pieceAt(16, 10);
      const start = service.startOfMove(walker);
      said = [];

      walker.location = { name: 'table', x: 18 * GRID, y: 10 * GRID };
      service.afterMove(walker, start);

      expect(walker.engagementZone).toBe('');
      expect(said).toEqual([]);
    });
  });

  describe('keeping zones in order after changes nobody made through them', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.peerId = 'peer-b';
      PeerCursor.myCursor.role = PeerRole.GameMaster;
    });

    function deleteFoeOfFreshZone(): EngagementZone {
      const foe = pieceAt(10, 10, true);
      const zone = service.declare(pieceAt(10, 10), foe)!;
      foe.destroy();
      TestBed.tick();
      return zone;
    }

    it('ends a zone whose enemy was deleted, a moment later, on the game master that keeps order', () => {
      deleteFoeOfFreshZone();

      vi.advanceTimersByTime(600);

      expect(zonesOn(table)).toEqual([]);
      expect(PeerCursor.myCursor.zoneProtocol).toBe('1');
    });

    it('leaves it to a game master lower in order that keeps zones too', () => {
      const other = new PeerCursor('other-cursor');
      other.initialize();
      other.peerId = 'peer-a';
      other.role = PeerRole.GameMaster;
      other.zoneProtocol = '1';
      deleteFoeOfFreshZone();

      vi.advanceTimersByTime(600);

      expect(zonesOn(table)).toHaveLength(1);
    });

    it('does not wait on a game master whose version knows nothing of zones', () => {
      const old = new PeerCursor('old-cursor');
      old.initialize();
      old.peerId = 'peer-a';
      old.role = PeerRole.GameMaster;
      deleteFoeOfFreshZone();

      vi.advanceTimersByTime(600);

      expect(zonesOn(table)).toEqual([]);
    });
  });
});

describe('metresPerCell', () => {
  it('turns a cell into metres, and takes a metre a cell where a table counts in cells', () => {
    expect(metresPerCell({ cellDistance: 1.5, cellDistanceUnit: 'm' })).toBe(1.5);
    expect(metresPerCell({ cellDistance: 5, cellDistanceUnit: 'ft' })).toBeCloseTo(1.524);
    expect(metresPerCell({ cellDistance: 1, cellDistanceUnit: 'マス' })).toBe(1);
    expect(metresPerCell({ cellDistance: 0, cellDistanceUnit: 'm' })).toBe(1);
  });
});
