import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { PiecePartsService } from '@axe/application/tabletop/piece-parts.service';
import { RideService } from '@axe/application/tabletop/ride.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
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

  it('tells those following the parts of the bodies of nothing where no body’s parts changed', async () => {
    const dragon = pieceAt('ドラゴン', 4, 4, 3);
    const head = pieceAt('頭', 5, 5);
    parts.attach(head, dragon);
    await Promise.resolve();
    let reads = 0;
    const followed = computed(() => {
      reads++;
      return parts.partsOfFollowed(dragon);
    });
    followed();

    head.name = '竜の頭';
    TestBed.inject(ObjectChangeService).notifyChanged(head.identifier);
    followed();

    expect(reads).toBe(1);
  });

  it('offers no body to a piece held on to, or holding on to another', () => {
    pieceAt('ドラゴン', 4, 4, 3);
    const held = pieceAt('捕虜', 5, 5);
    const holder = pieceAt('看守', 5, 5);
    held.grabbedBy = holder.identifier;

    expect(parts.bodiesFor(held)).toEqual([]);
    expect(parts.bodiesFor(holder)).toEqual([]);
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

  it('offers no body kept from the reader’s sight, nor one whose name is kept from them, to a player', () => {
    const lurking = pieceAt('潜む魔物', 4, 4, 3);
    const nameless = pieceAt('名もなき魔物', 10, 10, 3);
    nameless.hideName = true;
    const head = pieceAt('頭', 5, 5);
    const tail = pieceAt('尾', 11, 11);
    const vision = TestBed.inject(VisionService);
    vi.spyOn(vision, 'isTokenVisible').mockImplementation((piece) => piece !== lurking);
    PeerCursor.myCursor.role = PeerRole.Player;

    expect(parts.bodiesFor(head)).toEqual([]);
    expect(parts.attach(head, lurking)).toBe(false);
    expect(parts.bodiesFor(tail)).toEqual([]);

    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
    expect(parts.bodiesFor(tail)).toEqual([nameless]);
  });

  it('lets go of how a piece was drawn on another body as it is made a part of this one', () => {
    const dragon = pieceAt('ドラゴン', 4, 4, 3);
    const head = pieceAt('頭', 5, 5);
    head.partLayer = '{"x":0.5,"y":0.2,"width":0.3,"order":1}';
    head.partMask = 'mask-of-another-body';
    head.partFaces = '0:120-300';

    expect(parts.attach(head, dragon)).toBe(true);

    expect([head.partLayer, head.partMask, head.partFaces]).toEqual(['', '', '']);
  });

  it('puts back how a part was drawn while it is still a part of the body it was made a part of, and only then', () => {
    const dragon = pieceAt('ドラゴン', 4, 4, 3);
    const head = pieceAt('頭', 5, 5);
    head.partLayer = '{"x":0.5,"y":0.2,"width":0.3,"order":1}';
    head.partMask = '10:5.3';
    head.partFaces = '0:120-300';
    const was = parts.lookOf(head);
    parts.attach(head, dragon);

    expect(parts.putBackLook(head, dragon, was)).toBe(true);
    expect(parts.lookOf(head)).toEqual(was);

    parts.detach(head);
    parts.attach(head, dragon);
    parts.detach(head);
    expect(parts.putBackLook(head, dragon, was)).toBe(false);
    expect(parts.lookOf(head)).toEqual({ layer: '', mask: '', faces: '' });
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
