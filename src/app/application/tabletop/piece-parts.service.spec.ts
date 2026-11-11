import { TestBed } from '@angular/core/testing';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { PiecePartsService } from '@axe/application/tabletop/piece-parts.service';
import { RideService } from '@axe/application/tabletop/ride.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GRID = 50;

describe('PiecePartsService', () => {
  let parts: PiecePartsService;
  let links: PieceLinksService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const table = new GameTable();
    table.width = 30;
    table.height = 30;
    table.gridSize = GRID;
    table.initialize();
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Player;
    parts = TestBed.inject(PiecePartsService);
    links = TestBed.inject(PieceLinksService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(name: string, col: number, row: number, size = 1): GameCharacter {
    const piece = GameCharacter.create(name, size, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    return piece;
  }

  it('works out the parts of every body once for all that ask, and again as a piece is made a part', async () => {
    const dragon = pieceAt('ドラゴン', 4, 4, 3);
    const golem = pieceAt('ゴーレム', 12, 12, 3);
    const head = pieceAt('頭', 5, 5);
    const arm = pieceAt('腕', 13, 13);
    parts.attach(head, dragon);
    await Promise.resolve();
    const read = vi.spyOn(ObjectStore.instance, 'getObjects');

    expect(parts.partsOfFollowed(dragon)).toEqual([head]);
    expect(parts.partsOfFollowed(golem)).toEqual([]);
    expect(read).toHaveBeenCalledTimes(1);

    parts.attach(arm, golem);
    await Promise.resolve();
    expect(parts.partsOfFollowed(golem)).toEqual([arm]);
  });

  it('offers the pieces a piece stands on as bodies, none of them parts, and makes it a part of one', () => {
    const dragon = pieceAt('ドラゴン', 4, 4, 3);
    const head = pieceAt('頭', 5, 5);
    const knight = pieceAt('騎士', 12, 12);

    expect(parts.bodiesFor(head)).toEqual([dragon]);
    expect(parts.bodiesFor(knight)).toEqual([]);

    expect(parts.attach(head, dragon)).toBe(true);
    expect(parts.bodyOf(head)).toBe(dragon);
    expect(parts.partsOf(dragon)).toEqual([head]);
    expect(head.rideSeat).toBe('part');
    expect(links.mountOf(head)).toBeNull();
    expect(parts.bodiesFor(pieceAt('尾', 5, 5))).toEqual([dragon]);
    expect(parts.bodiesFor(dragon)).toEqual([]);
  });

  it('moves the parts wherever the body goes, and takes them off where it stands', () => {
    const dragon = pieceAt('ドラゴン', 4, 4, 3);
    const head = pieceAt('頭', 5, 5);
    parts.attach(head, dragon);

    dragon.location.x = 10 * GRID;
    dragon.location.y = 10 * GRID;
    links.carryBound(dragon);

    expect(links.withPartners([dragon])).toContain(head);
    expect(links.anchorOf(head)).toBe(dragon);
    expect(head.location.x).toBe(11 * GRID);
    expect(head.location.y).toBe(11 * GRID);

    expect(parts.detach(head)).toBe(true);
    expect(parts.bodyOf(head)).toBeNull();
    expect(head.rideSeat).toBe('');
    expect(head.location.x).toBe(11 * GRID);
  });

  it('is no part of a body that has gone from the table, nor of one that is a part itself', () => {
    const dragon = pieceAt('ドラゴン', 4, 4, 3);
    const head = pieceAt('頭', 5, 5);
    const eye = pieceAt('目', 5, 5);
    parts.attach(head, dragon);
    eye.ridingOn = head.identifier;
    eye.rideSeat = 'part';
    dragon.ridingOn = head.identifier;
    dragon.rideSeat = 'part';

    expect(parts.bodyOf(eye)).toBeNull();
    expect(parts.bodyOf(head)).toBeNull();

    dragon.ridingOn = '';
    dragon.rideSeat = '';
    dragon.setLocation('graveyard');
    expect(parts.bodyOf(head)).toBeNull();
  });

  it('makes nothing a part where the piece rides, is ridden or has parts, nor for a guest', () => {
    const dragon = pieceAt('ドラゴン', 4, 4, 3);
    const horse = pieceAt('馬', 5, 5);
    horse.mountable = '1';
    const knight = pieceAt('騎士', 5, 5);
    TestBed.inject(RideService).mount(knight, horse, 'rider');

    expect(parts.bodiesFor(knight)).toEqual([]);
    expect(parts.bodiesFor(horse)).toEqual([]);

    PeerCursor.myCursor.role = PeerRole.Guest;
    expect(parts.bodiesFor(pieceAt('頭', 5, 5))).toEqual([]);
    expect(parts.attach(pieceAt('尾', 5, 5), dragon)).toBe(false);
  });

  it('gets no part off with those riding the body, which is no mount of theirs', () => {
    const dragon = pieceAt('ドラゴン', 4, 4, 3);
    dragon.mountable = '1';
    const head = pieceAt('頭', 5, 5);
    parts.attach(head, dragon);
    const ride = TestBed.inject(RideService);

    expect(ride.aboard(dragon)).toEqual([]);
    expect(ride.menuOf(head).riding).toBeNull();
    expect(ride.menuOf(head).offers).toEqual([]);
  });

  it('takes the part’s turn in the body’s', () => {
    const dragon = pieceAt('ドラゴン', 4, 4, 3);
    const head = pieceAt('頭', 5, 5);
    parts.attach(head, dragon);

    expect(TestBed.inject(TurnOrderService).companionsOf(dragon.identifier)).toContain(head);
  });

  it('is bound to its body as one riding is to its mount, for the zones and every move', () => {
    const dragon = pieceAt('ドラゴン', 4, 4, 3);
    const head = pieceAt('頭', 5, 5);
    parts.attach(head, dragon);

    expect(links.bondOf(head)).toEqual({ id: head.identifier, grabbedBy: '', ridingOn: dragon.identifier });
  });
});
