import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { FreeMovePlanService } from '@axe/application/tabletop/free-move-plan.service';
import {
  INTERRUPT_WAIT_MS,
  InterruptOutcome,
  MoveInterruptService,
} from '@axe/application/tabletop/move-interrupt.service';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { zonesOn } from '@axe/domain/tabletop/zone/engagement-zone';
import { pointAtLength } from '@axe/domain/tabletop/zone/interrupt';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

describe('MoveInterruptService', () => {
  let service: MoveInterruptService;
  let table: GameTable;
  let said: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    Config.instance.zoneEnabled = true;
    Config.instance.interruptEnabled = true;
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = GRID;
    table.initialize();
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.peerId = 'peer-a';
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    PeerCursor.myCursor.zoneProtocol = '1';
    service = TestBed.inject(MoveInterruptService);
    said = [];
    vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage').mockImplementation((text: string) => {
      said.push(text);
      return null as never;
    });
  });

  afterEach(() => {
    Config.instance.zoneEnabled = null;
    Config.instance.interruptEnabled = false;
    Config.instance.zoneCountField = null;
    Config.instance.zoneSizes = null;
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(col: number, row: number, walk: number, npc = false): GameCharacter {
    const piece = GameCharacter.create(npc ? '敵' : '味方', 1, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    piece.isNpc = npc;
    DataElement.findElementByReference(piece.rootDataElement!, '移動')!.value = walk;
    return piece;
  }

  const middleOf = (col: number, row: number) => ({ x: (col + 0.5) * GRID, y: (row + 0.5) * GRID });
  /** A way along a row, from one column to another. */
  const WAY = [middleOf(2, 2), middleOf(8, 2)];

  /** Says on this peer's cursor that a piece is being moved along a way, as a plan being worked out does. */
  function moving(piece: GameCharacter, way: readonly { x: number; y: number }[] = WAY): void {
    PeerCursor.myCursor.movingCharacterIdentifier = piece.identifier;
    PeerCursor.myCursor.movingTableIdentifier = table.identifier;
    PeerCursor.myCursor.movingPoints = way.map((point) => `${point.x},${point.y}`).join(' ');
  }

  /** Lets the waiting move look for its answers. */
  async function look(): Promise<void> {
    await vi.advanceTimersByTimeAsync(250);
  }

  it('goes on at once where nobody could step in, or the room does not play it', async () => {
    const hero = pieceAt(2, 2, 6);
    pieceAt(15, 15, 2, true);

    expect(await service.negotiate(hero, WAY)).toBeNull();

    pieceAt(5, 3, 2, true);
    Config.instance.interruptEnabled = false;
    expect(await service.negotiate(hero, WAY)).toBeNull();
    expect(PeerCursor.myCursor.movingDeclared).toBe('');
  });

  it('declares the move, offers it to whoever answers for the enemy, and stops it where they step in', async () => {
    const hero = pieceAt(2, 2, 6);
    const foe = pieceAt(5, 3, 2, true);
    PeerCursor.myCursor.movingCharacterIdentifier = hero.identifier;
    PeerCursor.myCursor.movingTableIdentifier = table.identifier;
    PeerCursor.myCursor.movingPoints = WAY.map((point) => `${point.x},${point.y}`).join(' ');

    let outcome: InterruptOutcome | null | undefined;
    void service.negotiate(hero, WAY).then((result) => (outcome = result));
    TestBed.tick();

    expect(PeerCursor.myCursor.movingDeclared).not.toBe('');
    expect(service.waiting()).not.toBeNull();
    const offer = service.offer()!;
    expect(offer.pieces.map((piece) => piece.id)).toEqual([foe.identifier]);
    const choice = service.choice()!;
    expect(choice.along).toBeCloseTo(150 - Math.sqrt(100 ** 2 - 50 ** 2), 0);

    service.setAlong(120);
    service.answer();
    await look();

    expect(outcome).toEqual({ along: 120, pieces: [foe.identifier], zone: '', pullsIn: false, atOnce: false });
    expect(PeerCursor.myCursor.movingDeclared).toBe('');
    expect(service.waiting()).toBeNull();
  });

  it('lets a move by at once, unasked, for a player who does not see the piece moving', async () => {
    PeerCursor.myCursor.role = PeerRole.Player;
    PeerCursor.myCursor.userId = 'user-a';
    const hero = pieceAt(2, 2, 6, true);
    pieceAt(5, 3, 2).owner = 'user-a';
    vi.spyOn(TestBed.inject(VisionService), 'isTokenVisible').mockImplementation((piece) => piece !== hero);
    const declared = new PeerCursor();
    declared.initialize();
    declared.movingCharacterIdentifier = hero.identifier;
    declared.movingTableIdentifier = table.identifier;
    declared.movingPoints = WAY.map((point) => `${point.x},${point.y}`).join(' ');
    declared.movingDeclared = 'move-1';

    TestBed.tick();

    expect(service.offer()).toBeNull();
    expect(PeerCursor.myCursor.interruptAnswer).toBe('move-1|pass');
  });

  it('goes on unstopped where the answer lets it by', async () => {
    const hero = pieceAt(2, 2, 6);
    pieceAt(5, 3, 2, true);
    PeerCursor.myCursor.movingCharacterIdentifier = hero.identifier;
    PeerCursor.myCursor.movingTableIdentifier = table.identifier;
    PeerCursor.myCursor.movingPoints = '125,125 425,125';

    const negotiated = service.negotiate(hero, WAY);
    TestBed.tick();
    service.pass();
    await look();

    expect(await negotiated).toBeNull();
  });

  it('goes on with the answers it has once the wait runs out', async () => {
    const hero = pieceAt(2, 2, 6);
    pieceAt(5, 3, 2, true);
    const other = new PeerCursor('other-cursor');
    other.initialize();
    other.peerId = 'peer-0';
    other.role = PeerRole.GameMaster;
    other.zoneProtocol = '1';

    const negotiated = service.negotiate(hero, WAY);
    await vi.advanceTimersByTimeAsync(INTERRUPT_WAIT_MS + 500);

    expect(await negotiated).toBeNull();
  });

  it("waits for the owner of an enemy the player owns, and takes the owner's answer", async () => {
    const hero = pieceAt(2, 2, 6);
    const foe = pieceAt(5, 3, 2, true);
    foe.owner = 'user-b';
    const owner = new PeerCursor('owner-cursor');
    owner.initialize();
    owner.peerId = 'peer-b';
    owner.userId = 'user-b';
    owner.zoneProtocol = '1';

    let outcome: InterruptOutcome | null | undefined;
    void service.negotiate(hero, WAY).then((result) => (outcome = result));
    TestBed.tick();
    expect(service.offer()?.pieces ?? []).toEqual([]);
    await look();
    expect(outcome).toBeUndefined();

    owner.interruptAnswer = `${PeerCursor.myCursor.movingDeclared}|100|${foe.identifier}`;
    await look();

    expect(outcome).toEqual({ along: 100, pieces: [foe.identifier], zone: '', pullsIn: false, atOnce: false });
  });

  it('asks the game master rather than an owner made a guest, whose answer counts for nothing', async () => {
    const hero = pieceAt(2, 2, 6);
    const foe = pieceAt(5, 3, 2, true);
    foe.owner = 'user-b';
    const owner = new PeerCursor('owner-cursor');
    owner.initialize();
    owner.peerId = 'peer-b';
    owner.userId = 'user-b';
    owner.zoneProtocol = '1';
    owner.role = PeerRole.Guest;
    const master = new PeerCursor('master-cursor');
    master.initialize();
    master.peerId = 'peer-0';
    master.role = PeerRole.GameMaster;
    master.zoneProtocol = '1';

    let outcome: InterruptOutcome | null | undefined;
    void service.negotiate(hero, WAY).then((result) => (outcome = result));
    TestBed.tick();
    await look();
    owner.interruptAnswer = `${PeerCursor.myCursor.movingDeclared}|100|${foe.identifier}`;
    await look();
    expect(outcome).toBeUndefined();

    master.interruptAnswer = `${PeerCursor.myCursor.movingDeclared}|100|${foe.identifier}`;
    await look();

    expect(outcome).toEqual({ along: 100, pieces: [foe.identifier], zone: '', pullsIn: false, atOnce: false });
  });

  it('lets a game master let the move go on as though nobody had stepped in', async () => {
    const hero = pieceAt(2, 2, 6);
    pieceAt(5, 3, 2, true);
    const other = new PeerCursor('other-cursor');
    other.initialize();
    other.peerId = 'peer-0';
    other.role = PeerRole.GameMaster;
    other.zoneProtocol = '1';

    const negotiated = service.negotiate(hero, WAY);
    TestBed.tick();
    service.dropInterrupts();
    await look();

    expect(await negotiated).toBeNull();
  });

  it('does not stop a mover whose side outnumbers every piece that could step in', async () => {
    Config.instance.zoneCountField = '体数';
    const hero = pieceAt(2, 2, 6);
    hero.rootDataElement!.appendChild(DataElement.create('体数', 5, {}, '体数' + hero.identifier));
    pieceAt(5, 3, 2, true);

    expect(await service.negotiate(hero, WAY)).toBeNull();
    expect(PeerCursor.myCursor.movingDeclared).toBe('');
  });

  it('stands the pieces that stopped the move with it in a new zone, and says so', () => {
    const hero = pieceAt(5, 2, 6);
    const foe = pieceAt(5, 3, 2, true);

    service.settle(hero, { along: 150, pieces: [foe.identifier] }, middleOf(5, 2));

    const zones = zonesOn(table);
    expect(zones).toHaveLength(1);
    expect(hero.engagementZone).toBe(zones[0].identifier);
    expect(foe.engagementZone).toBe(zones[0].identifier);
    expect(zones[0].isForming).toBe(false);
    expect(said).toHaveLength(1);
  });

  it('stops a move drawn as straight legs at the point it is stepped into at', async () => {
    table.gridType = GridType.NONE;
    Config.instance.pathMove = true;
    const hero = pieceAt(2, 2, 6);
    const foe = pieceAt(5, 3, 2, true);
    const plan = TestBed.inject(FreeMovePlanService);
    plan.begin(hero);
    plan.lookAt(middleOf(8, 2).x, middleOf(8, 2).y);
    TestBed.tick();

    const walked = plan.run();
    await look();
    service.setAlong(120);
    service.answer();
    await vi.advanceTimersByTimeAsync(5000);
    await walked;
    Config.instance.pathMove = false;

    expect(hero.location.x).toBeCloseTo(125 + 120 - GRID / 2);
    expect(foe.engagementZone).toBe(hero.engagementZone);
    expect(hero.engagementZone).not.toBe('');
  });

  it('takes the answer of one stepping in at the first point offered, on a way drawn between pixels grazing its reach', async () => {
    table.gridType = GridType.NONE;
    Config.instance.pathMove = true;
    const hero = pieceAt(2, 1, 6);
    hero.location = { name: 'table', x: 2 * GRID + 0.45, y: GRID + 0.6 };
    const foe = pieceAt(5, 3, 2, true);
    const plan = TestBed.inject(FreeMovePlanService);
    plan.begin(hero);
    plan.lookAt(middleOf(8, 1).x + 0.45, middleOf(8, 1).y + 0.6);
    TestBed.tick();

    const walked = plan.run();
    await look();
    service.answer();
    await vi.advanceTimersByTimeAsync(5000);
    await walked;
    Config.instance.pathMove = false;

    expect(hero.engagementZone).not.toBe('');
    expect(foe.engagementZone).toBe(hero.engagementZone);
  });

  it('stops a move counted in cells on the cell it is stepped into at', async () => {
    const hero = pieceAt(2, 2, 6);
    const foe = pieceAt(5, 3, 2, true);
    const plan = TestBed.inject(MovePlanService);
    plan.begin(hero);
    plan.lookAt(middleOf(8, 2).x, middleOf(8, 2).y);
    TestBed.tick();

    const walked = plan.run();
    await look();
    expect(service.offer()?.pieces.map((piece) => piece.id)).toEqual([foe.identifier]);
    service.setAlong(110);
    service.answer();
    await vi.advanceTimersByTimeAsync(5000);
    await walked;

    expect(hero.location.x).toBe(5 * GRID);
    expect(hero.engagementZone).not.toBe('');
    expect(foe.engagementZone).toBe(hero.engagementZone);
  });

  describe('a zone the move runs into', () => {
    /** Zones two metres across whoever is in them, so where they stand along the row is plain. */
    beforeEach(() => {
      Config.instance.zoneSizes = '20:2:4';
    });

    function zoneAt(col: number, row: number): { friend: GameCharacter; foe: GameCharacter; zone: string } {
      const zones = TestBed.inject(EngagementZoneService);
      const friend = pieceAt(col, row, 2);
      const foe = pieceAt(col, row, 2, true);
      const zone = zones.declare(friend, foe)!;
      return { friend, foe, zone: zone.identifier };
    }

    it('is offered to whoever answers for an enemy in it, and pulls the piece to its centre where they stop it', async () => {
      const { foe, zone } = zoneAt(6, 2);
      const hero = pieceAt(2, 2, 6);
      moving(hero);

      let outcome: InterruptOutcome | null | undefined;
      void service.negotiate(hero, WAY).then((result) => (outcome = result));
      TestBed.tick();
      expect(service.offer()?.pieces.map((piece) => [piece.id, piece.member])).toEqual([[foe.identifier, true]]);
      expect(service.choice()?.zone).toBe(zone);
      service.answer();
      await look();

      expect(outcome).toEqual({ along: 100, pieces: [foe.identifier], zone, pullsIn: true, atOnce: true });
      service.settle(hero, outcome!, middleOf(4, 2));
      expect(hero.engagementZone).toBe(zone);
      expect(zonesOn(table)).toHaveLength(1);
    });

    it('lets the piece walk through where the side in it lets it by', async () => {
      zoneAt(6, 2);
      const hero = pieceAt(2, 2, 6);
      moving(hero);

      const negotiated = service.negotiate(hero, WAY);
      TestBed.tick();
      service.pass();
      await look();

      expect(await negotiated).toBeNull();
    });

    it('stops the piece of itself, where it first runs in, while nobody here can answer for it', async () => {
      PeerCursor.myCursor.role = PeerRole.Player;
      const { foe, zone } = zoneAt(6, 2);
      const hero = pieceAt(2, 2, 6);

      expect(await service.negotiate(hero, WAY)).toEqual({
        along: 100,
        pieces: [foe.identifier],
        zone,
        pullsIn: true,
        atOnce: true,
      });
      expect(PeerCursor.myCursor.movingDeclared).toBe('');
    });

    it('lets a piece standing in it stop the piece within its own reach inside it, making a zone that joins it', async () => {
      const { zone } = zoneAt(5, 3);
      const stander = pieceAt(4, 3, 2, true);
      const hero = pieceAt(2, 2, 6);
      moving(hero);

      let outcome: InterruptOutcome | null | undefined;
      void service.negotiate(hero, WAY).then((result) => (outcome = result));
      TestBed.tick();
      const offered = service.offer()!.pieces;
      expect(offered.find((piece) => piece.id === stander.identifier)?.member).toBe(false);
      service.togglePiece(stander.identifier);
      service.togglePiece(offered.find((piece) => piece.member)!.id);
      service.setAlong(100);
      expect(service.choice()?.pieces).toEqual([stander.identifier]);
      service.answer();
      await look();

      expect(outcome).toMatchObject({ pieces: [stander.identifier], zone, pullsIn: false, atOnce: true });
      service.settle(hero, outcome!, pointAtLength(WAY, outcome!.along));
      const zones = zonesOn(table);
      expect(zones).toHaveLength(1);
      expect(hero.engagementZone).toBe(zones[0].identifier);
      expect(stander.engagementZone).toBe(zones[0].identifier);
    });

    it('pulls the piece into whichever zone the answer names, where pieces of two zones stop it together', async () => {
      const first = zoneAt(3, 2);
      const second = zoneAt(6, 2);
      const hero = pieceAt(2, 2, 6);
      moving(hero);

      let outcome: InterruptOutcome | null | undefined;
      void service.negotiate(hero, WAY).then((result) => (outcome = result));
      TestBed.tick();
      for (const piece of service.offer()!.pieces) {
        if (!service.choice()!.pieces.includes(piece.id)) service.togglePiece(piece.id);
      }
      expect(service.choice()?.pieces).toHaveLength(2);
      expect(
        service
          .choice()
          ?.zones.map((zone) => zone.id)
          .sort()
      ).toEqual([first.zone, second.zone].sort());
      service.setZone(second.zone);
      service.answer();
      await look();

      expect(outcome).toMatchObject({ zone: second.zone, pullsIn: true });
      service.settle(hero, outcome!, pointAtLength(WAY, outcome!.along));
      expect(hero.engagementZone).toBe(second.zone);
      expect(first.foe.engagementZone).toBe(first.zone);
    });

    it('is offered a piece standing in it that moves inside it, and not one that said it would leave', async () => {
      const { foe } = zoneAt(5, 2);
      const hero = pieceAt(4, 2, 6);
      const within = [middleOf(4, 2), middleOf(5, 2)];
      moving(hero, within);

      const negotiated = service.negotiate(hero, within);
      TestBed.tick();
      expect(service.offer()?.pieces.map((piece) => piece.id)).toEqual([foe.identifier]);
      service.pass();
      await look();
      await negotiated;

      hero.zoneLeaveRound = '0';
      expect(await service.negotiate(hero, within)).toBeNull();
    });
  });

  describe('a piece nobody can see', () => {
    it('is never stopped, nor is a move nobody may stop', async () => {
      const hero = pieceAt(2, 2, 6);
      pieceAt(5, 3, 2, true);

      hero.unseen = '1';
      expect(await service.negotiate(hero, WAY)).toBeNull();
      hero.unseen = '';
      hero.unstoppableMove = '1';
      expect(await service.negotiate(hero, WAY)).toBeNull();
      expect(PeerCursor.myCursor.movingDeclared).toBe('');
    });

    it('makes the zone there and then where it stops a move', async () => {
      const hero = pieceAt(2, 2, 6);
      const foe = pieceAt(5, 3, 2, true);
      foe.unseen = '1';
      moving(hero);

      let outcome: InterruptOutcome | null | undefined;
      void service.negotiate(hero, WAY).then((result) => (outcome = result));
      TestBed.tick();
      service.answer();
      await look();

      expect(outcome).toMatchObject({ pieces: [foe.identifier], zone: '', atOnce: true });
    });
  });

  it('does not let a piece that is down or held fast step in', async () => {
    const hero = pieceAt(2, 2, 6);
    const down = pieceAt(5, 3, 2, true);
    const held = pieceAt(6, 3, 2, true);
    down.downed = '1';
    held.heldFast = '1';

    expect(await service.negotiate(hero, WAY)).toBeNull();
  });
});
