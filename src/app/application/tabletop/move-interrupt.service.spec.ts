import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { FreeMovePlanService } from '@axe/application/tabletop/free-move-plan.service';
import {
  INTERRUPT_WAIT_MS,
  InterruptOutcome,
  MoveInterruptService,
} from '@axe/application/tabletop/move-interrupt.service';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { zonesOn } from '@axe/domain/tabletop/zone/engagement-zone';
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

    expect(outcome).toEqual({ along: 120, pieces: [foe.identifier] });
    expect(PeerCursor.myCursor.movingDeclared).toBe('');
    expect(service.waiting()).toBeNull();
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

    expect(outcome).toEqual({ along: 100, pieces: [foe.identifier] });
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
});
