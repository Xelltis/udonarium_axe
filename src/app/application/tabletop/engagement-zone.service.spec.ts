import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { EngagementZoneService, metresPerCell } from '@axe/application/tabletop/engagement-zone.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { TurnHooksService } from '@axe/application/turn/turn-hooks.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { cellGridOf, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TurnState } from '@axe/domain/tabletop/turn-state';
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
    Config.instance.zoneClearName = null;
    Config.instance.interruptEnabled = false;
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

  it('keeps the lower limit of two zones joined on the one left standing', () => {
    const [low, high] = [
      service.declare(pieceAt(5, 5), pieceAt(5, 5, true))!,
      service.declare(pieceAt(20, 20), pieceAt(20, 20, true))!,
    ].sort((a, b) => (a.identifier < b.identifier ? -1 : 1));
    service.setLimit(high.identifier, 4);

    high.centre = { x: low.centre!.x + GRID, y: low.centre!.y };
    service.setSquare(low.identifier, false);

    expect(zonesOn(table)).toEqual([low]);
    expect(low.limit).toBe(4);
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

  it('names no enemy at the same point the reader does not see, to fight or to take hold of', () => {
    const hero = pieceAt(10, 10);
    const hidden = pieceAt(10, 10, true);
    const shown = pieceAt(10, 10, true);
    shown.name = '見える敵';
    vi.spyOn(TestBed.inject(VisionService), 'isTokenVisible').mockImplementation((piece) => piece !== hidden);

    expect(service.menuOf(hero).foes.map((foe) => foe.id)).toEqual([shown.identifier]);
    expect(service.menuOf(hero).grabbable.map((foe) => foe.id)).toEqual([shown.identifier]);
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

    it('forgets that a piece said it would leave once it is out of that zone, and holds it in the next', () => {
      const { hero } = fight();
      service.prepareLeave(hero);
      service.leave(hero);
      expect(hero.zoneLeaveRound).toBe('');

      const next = pieceAt(0, 0, true);
      next.location = { name: 'table', x: hero.location.x, y: hero.location.y };
      service.declare(hero, next);
      expect(hero.engagementZone).not.toBe('');
      expect(service.mayMove(hero, '')).toBe(false);
    });

    it('forgets that a piece said it would leave once its zone ends', () => {
      const { hero, foe } = fight();
      service.prepareLeave(hero);

      service.setDown(foe, true);

      expect(hero.engagementZone).toBe('');
      expect(hero.zoneLeaveRound).toBe('');
    });

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

    it('shuts a zone to a piece whose bodies would take it past its limit, those standing in it counted too', () => {
      Config.instance.zoneCountField = '体数';
      const { zone } = fight();
      service.setLimit(zone.identifier, 4);
      pieceAt(11, 10);
      const pair = pieceAt(16, 10);
      pair.rootDataElement!.appendChild(DataElement.create('体数', 2, {}, '体数' + pair.identifier));
      const single = pieceAt(16, 12);

      expect(service.reachTermsFor(pair, grid(), '')!.blocked?.get(cellOf(10, 10))).toBe(true);
      expect(service.reachTermsFor(single, grid(), '')!.blocked).toBeNull();
    });

    it('lets a piece standing in a zone say it will leave, and then walk out unheld', () => {
      fight();
      const stander = pieceAt(11, 10);
      expect(service.menuOf(stander).leave).toEqual({ said: false, maySay: true });

      service.prepareLeave(stander);

      expect(service.reachTermsFor(stander, grid(), '')!.stops).toBeNull();
      const start = service.startOfMove(stander);
      stander.location = { name: 'table', x: 16 * GRID, y: 10 * GRID };
      service.afterMove(stander, start);
      expect(stander.engagementZone).toBe('');
      expect(stander.zoneLeaveRound).toBe('');
    });

    it('lets a piece standing in an overflowing zone out by the one kind the room names, and holds it by any other', () => {
      Config.instance.moveKinds = '全力:3:,通常:1:';
      Config.instance.zoneLeaveKind = '全力';
      const { zone } = fight();
      service.setLimit(zone.identifier, 2);
      const stander = pieceAt(11, 10);

      expect(service.stateNow().zones[0].overflowing).toBe(true);
      expect(service.menuOf(stander).leave?.maySay).toBe(false);
      expect(service.reachTermsFor(stander, grid(), '全力')!.stops).toBeNull();
      expect(service.reachTermsFor(stander, grid(), '通常')!.stops?.get(cellOf(16, 10))).toBe(true);

      const start = service.startOfMove(stander, '通常');
      stander.location = { name: 'table', x: 16 * GRID, y: 10 * GRID };
      service.afterMove(stander, start);
      expect(stander.engagementZone).toBe(zone.identifier);
    });

    it('puts a piece beginning its turn standing in an overflowing zone into it, and leaves one out of the fight', () => {
      const { zone } = fight();
      service.setLimit(zone.identifier, 2);
      const stander = pieceAt(11, 10);
      const resting = pieceAt(11, 11);
      resting.offField = '1';

      TestBed.inject(TurnHooksService).turnStarted(stander.identifier);
      TestBed.inject(TurnHooksService).turnStarted(resting.identifier);

      expect(stander.engagementZone).toBe(zone.identifier);
      expect(resting.engagementZone).toBe('');
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

    it('lets no zone end a move of itself where the side a move runs into chooses whether to stop it', () => {
      Config.instance.interruptEnabled = true;
      const { zone } = fight();
      const walker = pieceAt(16, 10);
      const stander = pieceAt(11, 10);

      expect(service.reachTermsFor(walker, grid(), '')?.stops).toBeNull();
      expect(service.reachTermsFor(stander, grid(), '')?.stops).toBeNull();
      service.setLimit(zone.identifier, 3);
      expect(service.reachTermsFor(walker, grid(), '')?.blocked?.get(cellOf(10, 10))).toBe(true);

      const start = service.startOfMove(walker);
      walker.location = { name: 'table', x: 11 * GRID, y: 10 * GRID };
      service.afterMove(walker, start);
      expect(walker.engagementZone).toBe('');
    });

    it('lets a piece nobody can see, or one making a move nobody may stop, walk through a zone unheld', () => {
      fight();
      const walker = pieceAt(16, 10);

      walker.unseen = '1';
      expect(service.reachTermsFor(walker, grid(), '')?.stops).toBeNull();
      walker.unseen = '';
      walker.unstoppableMove = '1';
      expect(service.reachTermsFor(walker, grid(), '')?.stops).toBeNull();

      const start = service.startOfMove(walker);
      walker.location = { name: 'table', x: 11 * GRID, y: 10 * GRID };
      service.afterMove(walker, start);
      expect(walker.engagementZone).toBe('');
      expect(walker.unstoppableMove).toBe('');
    });

    it('takes a piece that goes down out of its zone where it lies, and keeps it from moving or being fought', () => {
      const { hero, foe, zone } = fight();
      const other = pieceAt(10, 10);
      service.join(other, zone.identifier);
      said = [];

      service.setDown(foe, true);

      expect(foe.engagementZone).toBe('');
      expect(
        service
          .stateNow()
          .insideOf(foe.identifier)
          .map((view) => view.id)
      ).toEqual([]);
      expect(service.mayMove(foe, '')).toBe(false);
      expect(service.menuOf(foe).joinable).toEqual([]);
      expect(service.menuOf(hero).foes).toEqual([]);
      expect(said).toHaveLength(1);

      service.setDown(foe, false);
      expect(foe.engagementZone).toBe('');
      expect(service.mayMove(foe, '')).toBe(true);
    });

    it('keeps a piece held fast from moving, and from being pulled in as its turn begins', () => {
      const { zone } = fight();
      service.setLimit(zone.identifier, 2);
      const stander = pieceAt(11, 10);
      service.setHeld(stander, true);

      expect(service.mayMove(stander, '')).toBe(false);
      expect(service.reachTermsFor(stander, grid(), '')?.noReach).toBe(true);
      service.pullInAtTurnStart(stander.identifier);
      expect(stander.engagementZone).toBe('');
    });

    it('pulls pieces into a zone onto its centre', () => {
      const { zone } = fight();
      const walker = pieceAt(14, 10);

      service.pullInto(zone.identifier, [walker]);

      expect(walker.engagementZone).toBe(zone.identifier);
      expect(service.stateNow().zoneOf(walker.identifier)?.id).toBe(zone.identifier);
    });

    it('offers a fight with an enemy at the point a piece is put down on, and declares it when taken up', () => {
      const snackbar = TestBed.inject(SnackbarService);
      const shown = vi.spyOn(snackbar, 'show');
      const hero = pieceAt(10, 10);
      const foe = pieceAt(10, 10, true);

      service.offerFight(hero);

      expect(shown).toHaveBeenCalledOnce();
      shown.mock.calls[0][1]!.action!.run();
      expect(hero.engagementZone).not.toBe('');
      expect(foe.engagementZone).toBe(hero.engagementZone);

      shown.mockClear();
      service.offerFight(hero);
      service.offerFight(pieceAt(20, 20));
      expect(shown).not.toHaveBeenCalled();
    });

    describe('a piece held on to by another', () => {
      it('cannot move of its own will until it is let go, and the room is told both', () => {
        const holder = pieceAt(12, 12, true);
        const captive = pieceAt(12, 12);
        said = [];

        service.grab(holder, captive);

        expect(captive.grabbedBy).toBe(holder.identifier);
        expect(service.mayMove(captive, '')).toBe(false);
        expect(service.reachTermsFor(captive, grid(), '')?.noReach).toBe(true);
        expect(service.menuOf(captive).grabbedBy?.id).toBe(holder.identifier);
        expect(service.menuOf(holder).grabbing.map((one) => one.id)).toEqual([captive.identifier]);
        service.release(captive);
        expect(service.mayMove(captive, '')).toBe(true);
        expect(said).toHaveLength(2);
      });

      it('offers taking hold of an enemy at the same point only, and joining no zone of its own will', () => {
        const { hero, foe } = fight();
        pieceAt(16, 16, true);
        expect(service.menuOf(hero).grabbable.map((one) => one.id)).toEqual([foe.identifier]);

        const holder = pieceAt(11, 10, true);
        const captive = pieceAt(11, 10);
        expect(service.menuOf(captive).joinable).toHaveLength(1);
        service.grab(holder, captive);
        expect(service.menuOf(captive).joinable).toEqual([]);
      });

      it('goes into a zone with the one holding it, and the one holding it with it, when either is fought', () => {
        fight();
        const holder = pieceAt(11, 10, true);
        const captive = pieceAt(11, 10);
        service.grab(holder, captive);
        const attacker = pieceAt(11, 10);

        service.declare(attacker, holder);

        expect(holder.engagementZone).not.toBe('');
        expect(captive.engagementZone).toBe(holder.engagementZone);
        expect(service.stateNow().zoneOf(captive.identifier)?.id).toBe(
          service.stateNow().zoneOf(holder.identifier)?.id
        );
      });

      it('stays where it is when it is held fast, while the one holding it is fought', () => {
        const holder = pieceAt(12, 12, true);
        const captive = pieceAt(12, 12);
        service.grab(holder, captive);
        service.setHeld(captive, true);

        service.declare(pieceAt(12, 12), holder);

        expect(holder.engagementZone).not.toBe('');
        expect(captive.engagementZone).toBe('');
      });

      it('is out of its zone once the one holding it leaves', () => {
        const { foe } = fight();
        const captive = pieceAt(10, 10);
        service.grab(foe, captive);
        service.join(captive, service.stateNow().zones[0].id);
        service.join(pieceAt(10, 10, true), service.stateNow().zones[0].id);

        service.leave(foe);

        expect(service.stateNow().zoneOf(captive.identifier)).toBeNull();
      });

      it('is carried to where the one holding it is put down, unless it is held fast', () => {
        const holder = pieceAt(12, 12, true);
        const captive = pieceAt(12, 12);
        const fast = pieceAt(12, 12);
        service.grab(holder, captive);
        service.grab(holder, fast);
        service.setHeld(fast, true);

        holder.location = { name: 'table', x: 15 * GRID, y: 12 * GRID };
        service.carryBound(holder);

        expect(captive.location.x).toBe(15 * GRID);
        expect(fast.location.x).toBe(12 * GRID);
      });

      it('steps into no move, held as it is', () => {
        const holder = pieceAt(14, 10, true);
        const captive = pieceAt(14, 10, true);
        service.grab(holder, captive);
        const walker = pieceAt(10, 10);

        const terms = service.interruptersOf(walker)!;

        expect(terms.candidates.map((one) => one.id)).toEqual([holder.identifier]);
      });
    });

    describe('a mount and those riding it', () => {
      function mounted(col: number, row: number, npc = false): { horse: GameCharacter; knight: GameCharacter } {
        const horse = pieceAt(col, row, npc);
        horse.mountable = '1';
        horse.mountPassenger = '1';
        const knight = pieceAt(col, row, npc);
        knight.ridingOn = horse.identifier;
        return { horse, knight };
      }

      it('go into a zone together and stand where the mount stands once gathered', () => {
        const { horse, knight } = mounted(12, 12);
        const foe = pieceAt(12, 12, true);

        service.declare(foe, horse);

        expect(knight.engagementZone).toBe(horse.engagementZone);
        expect(service.stateNow().zoneOf(knight.identifier)?.id).toBe(horse.engagementZone);
        expect([knight.location.x, knight.location.y]).toEqual([horse.location.x, horse.location.y]);
        expect([foe.location.x, foe.location.y]).not.toEqual([horse.location.x, horse.location.y]);
      });

      it('leave the one riding out of the zone once the mount is out of it', () => {
        const { horse, knight } = mounted(12, 12);
        const foe = pieceAt(12, 12, true);
        service.declare(foe, horse);
        service.join(pieceAt(12, 12), horse.engagementZone);

        service.leave(horse);

        expect(service.stateNow().zoneOf(knight.identifier)).toBeNull();
      });

      it('count a mount and the one riding it in front as one, as many as both, and nobody behind', () => {
        const { horse } = mounted(16, 16);
        const squire = pieceAt(16, 16);
        squire.ridingOn = horse.identifier;
        squire.rideSeat = 'passenger';

        expect(service.interruptersOf(horse)?.moverCount).toBe(2);
      });

      it('step into a move by the one riding in front, counting for both, and nobody riding behind', () => {
        const { horse, knight } = mounted(14, 10, true);
        const squire = pieceAt(14, 10, true);
        squire.ridingOn = horse.identifier;
        squire.rideSeat = 'passenger';
        const walker = pieceAt(10, 10);

        const terms = service.interruptersOf(walker)!;

        expect(terms.candidates.map((one) => [one.id, one.count])).toEqual([[knight.identifier, 2]]);
      });

      it('hold a mount in its zone where the two of them leaving would leave too few behind', () => {
        const { horse, knight } = mounted(10, 10);
        service.declare(pieceAt(10, 10, true), horse);
        service.join(pieceAt(10, 10), horse.engagementZone);
        service.join(pieceAt(10, 10), horse.engagementZone);

        expect(service.mayMove(horse, '')).toBe(false);
        knight.rideSeat = 'passenger';
        expect(service.mayMove(horse, '')).toBe(true);
      });

      it('shut a zone to a mount where everybody on it would take the zone past its limit', () => {
        const { zone } = fight();
        service.setLimit(zone.identifier, 3);
        const { horse, knight } = mounted(16, 10);

        expect(service.reachTermsFor(horse, grid(), '')!.blocked?.get(cellOf(10, 10))).toBe(true);
        knight.ridingOn = '';
        expect(service.reachTermsFor(horse, grid(), '')!.blocked).toBeNull();
      });
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

  describe('what reaches a piece', () => {
    it("counts a piece in a zone as standing at the zone's centre, and any other at its token's middle", () => {
      const hero = pieceAt(10, 10);
      const zone = service.declare(hero, pieceAt(10, 10, true))!;
      const loose = pieceAt(2, 2);

      expect(service.pointOf(hero)).toEqual(zone.centre);
      expect(service.pointOf(loose)).toEqual({ x: 2.5 * GRID, y: 2.5 * GRID });
    });

    it('measures a line of fire, counts an enemy standing in it, and lets a shooter with the name fire past it', () => {
      const shooter = pieceAt(0, 0);
      const target = pieceAt(10, 0, true);
      const blocker = pieceAt(5, 0, true);

      const report = service.lineOfFireFor(shooter, target)!;
      expect(report.distanceM).toBe(10);
      expect(report.pieces).toEqual([blocker.identifier]);

      Config.instance.zoneClearName = '精密';
      shooter.buffs.addRound('精密', '', 3);
      expect(service.lineOfFireFor(shooter, target)!.pieces).toEqual([]);
    });

    it('lets a shot fired into a zone from outside land on anybody in it', () => {
      const hero = pieceAt(10, 10);
      const foe = pieceAt(10, 10, true);
      service.declare(hero, foe);

      expect([...service.lineOfFireFor(pieceAt(0, 10), foe)!.candidates].sort()).toEqual(
        [hero.identifier, foe.identifier].sort()
      );
    });
  });

  describe('a zone formed where a move was stepped into', () => {
    it('forms at once while no turns are kept', () => {
      const zone = service.formAt({ x: 5.5 * GRID, y: 5.5 * GRID }, [pieceAt(5, 5), pieceAt(5, 6, true)])!;

      expect(zone.isForming).toBe(false);
      expect(zone.centre).toEqual({ x: 5.5 * GRID, y: 5.5 * GRID });
    });

    it('is forming while turns are kept, and comes into force as a turn ends', () => {
      TestBed.inject(TurnState).phase = 'acting';
      const zone = service.formAt({ x: 5.5 * GRID, y: 5.5 * GRID }, [pieceAt(5, 5), pieceAt(5, 6, true)])!;
      expect(zone.isForming).toBe(true);

      TestBed.inject(TurnHooksService).turnEnded();

      expect(zone.isForming).toBe(false);
      TestBed.inject(TurnState).phase = 'idle';
    });

    it('forms at once while turns are kept, where it is asked to', () => {
      TestBed.inject(TurnState).phase = 'acting';
      const zone = service.formAt({ x: 5.5 * GRID, y: 5.5 * GRID }, [pieceAt(5, 5), pieceAt(5, 6, true)], true)!;

      expect(zone.isForming).toBe(false);
      TestBed.inject(TurnState).phase = 'idle';
    });

    it('forms nothing for fewer than two pieces', () => {
      expect(service.formAt({ x: 0, y: 0 }, [pieceAt(5, 5)])).toBeNull();
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

    it('says on its own cursor that it keeps zones before any zone needs tidying', () => {
      TestBed.tick();

      expect(PeerCursor.myCursor.zoneProtocol).toBe('1');
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
