import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ImageService } from '@axe/application/storage/image.service';
import { PictureSizeService } from '@axe/application/storage/picture-size.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { PiecePicturesService } from '@axe/application/tabletop/piece-pictures.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('TablePiecesService', () => {
  let pieces: TablePiecesService;
  const gridSize = 50;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        { provide: PictureSizeService, useValue: { version: signal(0), sizeOf: () => ({ width: 100, height: 120 }) } },
      ],
    });
    const table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = gridSize;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    const face = { isEmpty: false, url: 'blob:face' } as unknown as ImageFile;
    vi.spyOn(TestBed.inject(ImageService), 'getEmptyOr').mockReturnValue(face);
    pieces = TestBed.inject(TablePiecesService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function dieAt(x: number, y: number): DiceSymbol {
    const die = DiceSymbol.create('D6', DiceType.D6, 1);
    die.location = { name: 'table', x, y };
    return die;
  }

  it('draws a die on the floor with its frame and the picture of its face', () => {
    const die = dieAt(100, 200);

    const drawn = pieces.sprites();

    expect(drawn.map((sprite) => sprite.id)).toEqual([`${die.identifier}#frame`, `${die.identifier}#picture`]);
    expect(drawn[0].centre).toEqual({ x: 100 + gridSize / 2, y: 200 + gridSize / 2, z: 1 });
    expect(drawn[1].look).toEqual({ kind: 'picture', url: 'blob:face' });
  });

  it('lifts a die on the floor onto the raised ground under its middle', () => {
    TestBed.inject(GroundService).dab({ kind: 'raise', x: 2.5, y: 4.5, radius: 3, strength: 1 });
    const die = dieAt(100, 200);

    const [frame] = pieces.sprites().filter((sprite) => sprite.owner === die.identifier);

    expect(frame.centre.z).toBeCloseTo(1 + gridSize, 6);
  });

  it('lifts a die standing on a block by as far as the block is lifted, keeping it on the block’s top', () => {
    const ground = TestBed.inject(GroundService);
    ground.dab({ kind: 'raise', x: 2.5, y: 4.5, radius: 3, strength: 1 });
    const block = Terrain.create('block', 1, 1, 1, '', '');
    block.location = { name: 'table', x: 100, y: 200 };
    TestBed.inject(TableSelecter).viewTable!.appendChild(block);
    const die = dieAt(100, 200);
    die.posZ = gridSize;

    const [frame] = pieces.sprites().filter((sprite) => sprite.owner === die.identifier);

    expect(frame.centre.z).toBeCloseTo(1 + gridSize + ground.lowestPxIn(100, 200, gridSize, gridSize), 6);
  });

  it('keeps a die on a block that reaches over many cells, wherever on the block it stands', () => {
    const ground = TestBed.inject(GroundService);
    ground.dab({ kind: 'raise', x: 4, y: 6, radius: 4, strength: 1 });
    const block = Terrain.create('block', 4, 4, 1, '', '');
    block.location = { name: 'table', x: 100, y: 200 };
    TestBed.inject(TableSelecter).viewTable!.appendChild(block);
    const lift = ground.lowestPxIn(100, 200, 4 * gridSize, 4 * gridSize);
    const heights = [100, 230].map((x) => {
      const die = dieAt(x, 330);
      die.posZ = gridSize;
      return pieces.sprites().find((sprite) => sprite.owner === die.identifier)!.centre.z;
    });

    expect(lift).toBeGreaterThan(0);
    for (const height of heights) expect(height).toBeCloseTo(1 + gridSize + lift, 6);
  });

  it('keeps a die on a block too vast to lay out cell by cell, anywhere on the block', () => {
    const ground = TestBed.inject(GroundService);
    ground.dab({ kind: 'raise', x: 10, y: 10, radius: 3, strength: 1 });
    const vast = Terrain.create('vast', 20, 20, 1, '', '');
    vast.location = { name: 'table', x: 0, y: 0 };
    TestBed.inject(TableSelecter).viewTable!.appendChild(vast);
    const die = dieAt(480, 480);
    die.posZ = gridSize;

    const centre = pieces.sprites().find((sprite) => sprite.owner === die.identifier)!.centre;

    expect(centre.z).toBeCloseTo(1 + gridSize + ground.lowestPxIn(0, 0, 20 * gridSize, 20 * gridSize), 6);
  });

  it('stands a piece on the floor where its place is, lifted onto the ground under it, and where it is being moved to', () => {
    const ground = TestBed.inject(GroundService);
    ground.dab({ kind: 'raise', x: 2.5, y: 4.5, radius: 3, strength: 1 });
    const die = dieAt(100, 200);
    die.posZ = 7;

    expect(pieces.footOf(die)).toEqual({ surface: 'floor', x: 100, y: 200, height: 7 + gridSize });
    TestBed.inject(TransientPlacementService).place(die.identifier, { surface: 'floor', x: 600, y: 700, z: 0 });
    expect(pieces.footOf(die)).toEqual({ surface: 'floor', x: 600, y: 700, height: 0 });
  });

  it('stands a piece on frozen water on the ice, and one on open water on the floor under it', async () => {
    const pond = TableAmbience.create('池', 'water', 2, 2);
    pond.location = { name: 'table', x: 100, y: 200 };
    pond.surfaceHeight = 0.5;
    pond.iceCover = 1;
    TestBed.inject(TableSelecter).viewTable!.appendChild(pond);
    await Promise.resolve();
    await Promise.resolve();
    const die = dieAt(100, 200);

    expect(pieces.footOf(die)).toEqual({ surface: 'floor', x: 100, y: 200, height: gridSize / 2 });
    pond.iceCover = 0;
    await Promise.resolve();
    expect(pieces.footOf(die)).toEqual({ surface: 'floor', x: 100, y: 200, height: 0 });
  });

  it('draws a die this seat is moving where it is being moved to', () => {
    const die = dieAt(100, 200);
    pieces.sprites();

    TestBed.inject(TransientPlacementService).place(die.identifier, { surface: 'floor', x: 300, y: 400, z: 0 });

    expect(pieces.sprites()[0].centre).toEqual({ x: 300 + gridSize / 2, y: 400 + gridSize / 2, z: 1 });
  });

  it('draws a piece let go of where its object was put, though no change of the object has come yet', () => {
    const die = dieAt(100, 200);
    pieces.sprites();
    const transient = TestBed.inject(TransientPlacementService);
    transient.place(die.identifier, { surface: 'floor', x: 300, y: 400, z: 0 });
    pieces.sprites();

    die.location.x = 300;
    die.location.y = 400;
    transient.release(die.identifier);

    expect(pieces.sprites()[0].centre).toEqual({ x: 300 + gridSize / 2, y: 400 + gridSize / 2, z: 1 });
  });

  it('draws again only the piece this seat moves, keeping the parts of the rest as they were', () => {
    const moved = dieAt(100, 200);
    const still = dieAt(300, 200);
    const stillParts = () => pieces.sprites().filter((sprite) => sprite.owner === still.identifier);
    const before = stillParts();

    TestBed.inject(TransientPlacementService).place(moved.identifier, { surface: 'floor', x: 500, y: 400, z: 0 });

    expect(pieces.sprites().find((sprite) => sprite.owner === moved.identifier)?.centre).toEqual({
      x: 500 + gridSize / 2,
      y: 400 + gridSize / 2,
      z: 1,
    });
    expect(stillParts()).toHaveLength(2);
    stillParts().forEach((part, index) => expect(part).toBe(before[index]));
  });

  it('draws again only the piece that changes, keeping the parts of the rest as they were', () => {
    const changed = dieAt(100, 200);
    const still = dieAt(300, 200);
    const stillParts = () => pieces.sprites().filter((sprite) => sprite.owner === still.identifier);
    const before = stillParts();

    changed.isUsed = true;
    TestBed.inject(ObjectChangeService).notifyChanged(changed.identifier);

    expect(pieces.sprites().filter((sprite) => sprite.owner === changed.identifier)[0].brightness).toBe(0.45);
    expect(stillParts()).toHaveLength(2);
    stillParts().forEach((part, index) => expect(part).toBe(before[index]));
  });

  it('draws no piece again as the table changes otherwise than in its shape, as when something on it moves', () => {
    const die = dieAt(100, 200);
    const parts = () => pieces.sprites().filter((sprite) => sprite.owner === die.identifier);
    const before = parts();

    TestBed.inject(ObjectChangeService).notifyChanged(TestBed.inject(TableSelecter).viewTable!.identifier);

    parts().forEach((part, index) => expect(part).toBe(before[index]));
    TestBed.inject(TableSelecter).viewTable!.gridSize = gridSize * 2;
    TestBed.inject(ObjectChangeService).notifyChanged(TestBed.inject(TableSelecter).viewTable!.identifier);
    expect(parts()[0].widthPx).toBe(gridSize * 2);
  });

  it('draws a character again for a change to the block it stands on, and not for one to a block elsewhere', () => {
    const character = GameCharacter.create('騎士', 1, '');
    character.location = { name: 'table', x: 100, y: 200 };
    TestBed.inject(PiecePicturesService).show(character.identifier, {
      url: 'blob:pedestal',
      widthPx: 50,
      heightPx: 50,
    });
    const under = Terrain.create('under', 1, 1, 1, '', '');
    under.location = { name: 'table', x: 100, y: 200 };
    const elsewhere = Terrain.create('elsewhere', 1, 1, 1, '', '');
    elsewhere.location = { name: 'table', x: 600, y: 600 };
    TestBed.inject(TableSelecter).viewTable!.appendChild(under);
    TestBed.inject(TableSelecter).viewTable!.appendChild(elsewhere);
    const change = TestBed.inject(ObjectChangeService);
    const parts = () => pieces.sprites().filter((sprite) => sprite.owner === character.identifier);
    const before = parts();

    change.notifyChanged(elsewhere.identifier);
    parts().forEach((part, index) => expect(part).toBe(before[index]));

    change.notifyChanged(under.identifier);
    expect(parts()[0]).not.toBe(before[0]);
  });

  it('draws a character no more for a block whose box is no box, as one typed endlessly wide', () => {
    const character = GameCharacter.create('騎士', 1, '');
    character.location = { name: 'table', x: 100, y: 200 };
    TestBed.inject(PiecePicturesService).show(character.identifier, {
      url: 'blob:pedestal',
      widthPx: 50,
      heightPx: 50,
    });
    const endless = Terrain.create('endless', 1, 1, 1, '', '');
    endless.location = { name: 'table', x: 0, y: 0 };
    endless.width = Number.POSITIVE_INFINITY;
    TestBed.inject(TableSelecter).viewTable!.appendChild(endless);
    const parts = () => pieces.sprites().filter((sprite) => sprite.owner === character.identifier);
    const before = parts();

    TestBed.inject(ObjectChangeService).notifyChanged(endless.identifier);

    expect(before.length).toBeGreaterThan(0);
    expect(parts()).toHaveLength(before.length);
    parts().forEach((part, index) => expect(part).toBe(before[index]));
  });

  it('leans a character this seat drags as the ground leans where it is drawn, not where it was let go of', () => {
    const character = GameCharacter.create('騎士', 1, '');
    character.location = { name: 'table', x: 100, y: 200 };
    TestBed.inject(PiecePicturesService).show(character.identifier, {
      url: 'blob:pedestal',
      widthPx: 50,
      heightPx: 50,
    });
    const slope = Terrain.create('slope', 2, 2, 1, '', '');
    slope.location = { name: 'table', x: 500, y: 500 };
    slope.isSlope = true;
    TestBed.inject(TableSelecter).viewTable!.appendChild(slope);
    const transient = TestBed.inject(TransientPlacementService);
    const facing = () => pieces.sprites().find((sprite) => sprite.owner === character.identifier)!.facing;

    transient.place(character.identifier, { surface: 'floor', x: 300, y: 200, z: 0 });
    const onFlat = facing();
    transient.place(character.identifier, { surface: 'floor', x: 520, y: 520, z: 25 });

    expect(facing()).not.toEqual(onFlat);
  });

  it('draws a piece on the board it stands on once the board comes, and on the floor once it goes', async () => {
    vi.spyOn(TestBed.inject(ImageService), 'getEmptyOr').mockReturnValue(ImageFile.Empty);
    const light = LightSource.create('L');
    light.location = { name: 'table', x: 10, y: 10, surface: 'late-board' };
    TestBed.inject(PiecePicturesService).show(light.identifier, { url: 'blob:bulb', widthPx: 36, heightPx: 36 });
    const centre = () => pieces.sprites().find((sprite) => sprite.owner === light.identifier)!.centre;
    const onFloor = centre();

    const board = WhiteBoard.create('board', 4, 2, 1, 'late-board');
    board.location = { name: 'table', x: 400, y: 600 };
    TestBed.inject(TableSelecter).viewTable!.appendChild(board);
    await Promise.resolve();
    expect(centre()).not.toEqual(onFloor);

    ObjectStore.instance.remove(board);
    await Promise.resolve();
    expect(centre()).toEqual(onFloor);
  });

  it('draws no piece again as this seat’s cursor changes, but follows who this seat is', () => {
    PeerCursor.createMyCursor();
    const change = TestBed.inject(ObjectChangeService);
    const die = dieAt(100, 200);
    const parts = () => pieces.sprites().filter((sprite) => sprite.owner === die.identifier);
    const before = parts();

    PeerCursor.myCursor.name = 'moving about';
    change.notifyChanged(PeerCursor.myCursor.identifier);

    parts().forEach((part, index) => expect(part).toBe(before[index]));
    die.owner = 'somebody-else';
    change.notifyChanged(die.identifier);
    expect(parts()[1].brightness).toBe(0);
  });

  it('draws no coin again while another piece plays a move', () => {
    const coin = Coin.create('coin');
    coin.location = { name: 'table', x: 100, y: 200 };
    const die = dieAt(300, 200);
    const playing = signal(new Map<string, never>());
    vi.spyOn(TestBed.inject(PieceMotionsService), 'posesNow').mockImplementation(() => playing());
    const [before] = pieces.coins();

    const pose = { across: 10, down: 0, out: 0, scale: 1, turnDeg: 0, flipDeg: 0, shown: 1 };
    playing.set(new Map([[die.identifier, { pose } as never]]));

    expect(pieces.coins()[0]).toBe(before);
  });

  it('carries the pieces standing on a white board this seat moves along with it', () => {
    const board = WhiteBoard.create('board', 4, 2, 1);
    board.location = { name: 'table', x: 100, y: 200 };
    TestBed.inject(TableSelecter).viewTable!.appendChild(board);
    const die = dieAt(0, 0);
    die.location = { name: 'table', x: 10, y: 10, surface: board.identifier };
    const centre = () => pieces.sprites().find((sprite) => sprite.id === `${die.identifier}#frame`)!.centre;
    const before = centre();

    TestBed.inject(TransientPlacementService).place(board.identifier, { surface: 'floor', x: 400, y: 600, z: 0 });

    expect(centre().x - before.x).toBeCloseTo(300);
    expect(centre().y - before.y).toBeCloseTo(400);
  });

  it('leaves out a die the fog hides from this seat', () => {
    dieAt(100, 200);
    vi.spyOn(TestBed.inject(VisionService), 'isPieceHiddenByFog').mockReturnValue(true);

    expect(pieces.sprites()).toEqual([]);
  });

  it('draws a die it may not read the face of as a black picture', () => {
    const die = dieAt(100, 200);
    die.owner = 'somebody-else';

    expect(pieces.sprites()[1].brightness).toBe(0);
  });

  it('blacks a die out the moment it is kept back, and dims one marked as spent, as the die says so', () => {
    const die = dieAt(100, 200);
    const change = TestBed.inject(ObjectChangeService);
    const brightness = () => pieces.sprites().map((sprite) => sprite.brightness);
    expect(brightness()).toEqual([1, 1]);

    die.owner = 'somebody-else';
    change.notifyChanged(die.identifier);
    expect(brightness()[1]).toBe(0);

    die.owner = '';
    die.isUsed = true;
    change.notifyChanged(die.identifier);
    expect(brightness()).toEqual([0.45, 0.45]);

    die.isUsed = false;
    change.notifyChanged(die.identifier);
    expect(brightness()).toEqual([1, 1]);
  });

  it('draws a die standing on a board no longer on the table on the floor', () => {
    const die = dieAt(100, 200);
    die.location = { name: 'table', x: 100, y: 200, surface: 'a-board-that-went-away' };

    expect(pieces.sprites()[0].centre).toEqual({ x: 100 + gridSize / 2, y: 200 + gridSize / 2, z: 1 });
    expect(pieces.footOf(die).surface).toBe('floor');
  });

  it('draws a die standing on a wall the table does not draw on the floor', () => {
    const die = dieAt(100, 200);
    die.location = { name: 'table', x: 100, y: 200, surface: 'north-wall' };

    expect(pieces.sprites()[0].centre).toEqual({ x: 100 + gridSize / 2, y: 200 + gridSize / 2, z: 1 });
  });

  it('lays a coin on the floor with the side it landed on turned out', () => {
    const coin = Coin.create('coin');
    coin.location = { name: 'table', x: 100, y: 200 };
    coin.face = 'back';

    expect(pieces.coins()).toMatchObject([
      { id: coin.identifier, x: 100 + gridSize / 2, y: 200 + gridSize / 2, outer: { side: 'back' }, backUp: true },
    ]);
  });

  it('lays a card on the floor with the picture of the face it shows', () => {
    const card = Card.create('card', 'front-picture', 'back-picture');
    card.location = { name: 'table', x: 100, y: 200 };

    expect(pieces.sprites()).toMatchObject([{ id: `${card.identifier}#face`, owner: card.identifier, kind: 'card' }]);
  });

  it('lays a card from the picture the page takes of its face, where it carries words', () => {
    const card = Card.create('card', 'front-picture', 'back-picture');
    card.location = { name: 'table', x: 100, y: 200 };

    TestBed.inject(PiecePicturesService).show(card.identifier, { url: 'blob:face', widthPx: 100, heightPx: 150 });

    expect(pieces.sprites()).toMatchObject([
      {
        id: `${card.identifier}#face`,
        look: { url: 'blob:face' },
        widthPx: gridSize * card.size,
        heightPx: gridSize * card.size * 1.5,
      },
    ]);
  });

  it('stands a stack of cards on the floor as thick as its cards', () => {
    const stack = CardStack.create('stack');
    stack.location = { name: 'table', x: 100, y: 200 };
    for (let i = 0; i < 3; i++) stack.putOnTop(Card.create(`card-${i}`, 'front-picture', 'back-picture'));

    expect(pieces.sprites().map((sprite) => sprite.id)).toEqual([
      `${stack.identifier}#layer-0`,
      `${stack.identifier}#layer-1`,
      `${stack.identifier}#plate`,
      `${stack.identifier}#top`,
    ]);
  });

  it('draws a note from the picture the page takes of its panel, once there is one', () => {
    const note = TextNote.create('title', 'text');
    note.location = { name: 'table', x: 100, y: 200 };
    expect(pieces.sprites()).toEqual([]);

    TestBed.inject(PiecePicturesService).show(note.identifier, { url: 'blob:panel', widthPx: 100, heightPx: 50 });

    expect(pieces.sprites()).toMatchObject([{ id: `${note.identifier}#panel`, look: { url: 'blob:panel' } }]);
  });

  it('stands a light as its own picture, held in its cell keeping its shape', () => {
    const light = LightSource.create('L');
    light.location = { name: 'table', x: 100, y: 200 };

    expect(pieces.sprites()).toMatchObject([
      {
        id: `${light.identifier}#mark`,
        look: { url: 'blob:face' },
        widthPx: 100 * (gridSize / 120),
        heightPx: gridSize,
      },
    ]);
  });

  it('stands a light with no picture of its own as the picture the page takes of its mark', () => {
    vi.spyOn(TestBed.inject(ImageService), 'getEmptyOr').mockReturnValue(ImageFile.Empty);
    const light = LightSource.create('L');
    light.location = { name: 'table', x: 100, y: 200 };
    TestBed.inject(PiecePicturesService).show(light.identifier, { url: 'blob:bulb', widthPx: 36, heightPx: 36 });

    expect(pieces.sprites()).toMatchObject([{ look: { url: 'blob:bulb' }, widthPx: 36, heightPx: 36 }]);
  });

  it('lays a map mask flat over its place from the picture the page takes of it', () => {
    const mask = GameTableMask.create('mask', 3, 2, 50);
    mask.location = { name: 'table', x: 100, y: 200 };
    TestBed.inject(TableSelecter).viewTable!.appendChild(mask);

    TestBed.inject(PiecePicturesService).show(mask.identifier, { url: 'blob:mask', widthPx: 150, heightPx: 100 });

    expect(pieces.sprites()).toMatchObject([{ id: `${mask.identifier}#picture`, centre: { x: 175, y: 250 } }]);
  });

  it('lays a range’s cells round its place from the picture the page takes of them', () => {
    const range = RangeArea.create('range', 1, 3, 0.5);
    range.location = { name: 'table', x: 100, y: 200 };

    TestBed.inject(PiecePicturesService).show(range.identifier, {
      url: 'blob:cells',
      widthPx: 300,
      heightPx: 200,
      offsetX: -150,
      offsetY: -100,
    });

    expect(pieces.sprites()).toMatchObject([{ id: `${range.identifier}#picture`, centre: { x: 100, y: 200 } }]);
  });

  it('stands a white board where its face is, from the picture the page takes of what it wears', () => {
    const board = WhiteBoard.create('board', 4, 2, 1);
    board.location = { name: 'table', x: 100, y: 200 };
    TestBed.inject(TableSelecter).viewTable!.appendChild(board);

    TestBed.inject(PiecePicturesService).show(board.identifier, { url: 'blob:board', widthPx: 200, heightPx: 100 });

    expect(pieces.sprites()).toMatchObject([{ id: `${board.identifier}#face`, widthPx: 200, heightPx: 100 }]);
  });

  it('turns a piece about the middle of its first sprite lying on its face, on the face it is drawn on', () => {
    const die = dieAt(100, 200);

    expect(pieces.turnAboutOf(die)).toEqual({ surface: 'floor', x: 125, y: 225, height: 1 });
  });

  it('moves the parts of a piece a move moves, about the middle of where it stands', () => {
    const die = dieAt(100, 200);
    const pose = { across: 10, down: 0, out: 0, scale: 2, turnDeg: 90, flipDeg: 0, shown: 1 };
    vi.spyOn(TestBed.inject(PieceMotionsService), 'posesNow').mockReturnValue(
      new Map([[die.identifier, { pose, parts: ['picture'] }]])
    );

    const [frame, picture] = pieces.sprites();

    expect(frame.centre).toEqual({ x: 125, y: 225, z: 1 });
    expect(frame.widthPx).toBe(gridSize);
    expect(picture.centre.x).toBeCloseTo(135, 6);
    expect(picture.centre.y).toBeCloseTo(225, 6);
    expect(picture.widthPx).toBe(gridSize * 2);
    expect(picture.facing).not.toBe('eye');
    if (picture.facing === 'eye') return;
    expect(picture.facing.across.x).toBeCloseTo(0, 6);
    expect(picture.facing.across.y).toBeCloseTo(1, 6);
  });

  it('turns a flipping coin over from the side it starts on, whichever it is to land on', () => {
    const coin = Coin.create('coin');
    coin.location = { name: 'table', x: 100, y: 200 };
    coin.face = 'back';
    const pose = { across: 0, down: 0, out: 90, scale: 1.18, turnDeg: 0, flipDeg: 720, shown: 1 };
    vi.spyOn(TestBed.inject(PieceMotionsService), 'posesNow').mockReturnValue(
      new Map([[coin.identifier, { pose, backUp: false }]])
    );

    expect(pieces.coins()).toMatchObject([{ id: coin.identifier, backUp: false, motion: pose }]);
  });

  it('turns a character’s picture with the piece on a table seen from above that shows facing by turning it', () => {
    const table = TestBed.inject(TableSelecter).viewTable!;
    table.mode2d = true;
    const hero = GameCharacter.create('hero', 1, 'hero.png');
    hero.location = { name: 'table', x: 100, y: 200 };
    hero.rotate = 90;
    vi.spyOn(TestBed.inject(PiecePicturesService), 'pictureOf').mockReturnValue({
      url: 'blob:pedestal',
      widthPx: gridSize,
      heightPx: gridSize,
    });
    const picture = () => pieces.sprites().find((sprite) => sprite.id === `${hero.identifier}#picture`)!;
    expect(picture().turn).toBeUndefined();

    table.facingMark = 'turn';
    TestBed.inject(ObjectChangeService).notifyChanged(table.identifier);

    expect(picture()).toMatchObject({ facing: 'eye', turn: { deg: 90 } });
  });

  describe('a character drawn as a 3D model', () => {
    function knightAt(x: number, y: number): GameCharacter {
      const knight = GameCharacter.create('騎士', 1, '');
      knight.location = { name: 'table', x, y };
      knight.modelIdentifier = 'knight-model';
      knight.modelScale = '2';
      return knight;
    }

    it('draws a character whose model is not held here as its picture', () => {
      const knight = knightAt(100, 200);

      expect(pieces.models()).toEqual([]);
      expect(pieces.sprites().filter((sprite) => sprite.owner === knight.identifier && sprite.hidden)).toEqual([]);
    });

    it('stands the model at the middle of the footprint once its bytes are held, and leaves its picture undrawn but its pedestal drawn', () => {
      vi.spyOn(TestBed.inject(ModelStorage), 'get').mockReturnValue({ isReady: true, url: 'blob:knight' } as never);
      vi.spyOn(TestBed.inject(PiecePicturesService), 'pictureOf').mockReturnValue({
        url: 'blob:pedestal',
        widthPx: gridSize,
        heightPx: gridSize,
      } as never);
      const knight = knightAt(100, 200);

      expect(pieces.models()).toEqual([
        expect.objectContaining({
          owner: knight.identifier,
          url: 'blob:knight',
          foot: { x: 100 + gridSize / 2, y: 200 + gridSize / 2, z: 0 },
          footprintPx: gridSize,
          walking: false,
          model: expect.objectContaining({ identifier: 'knight-model', scale: 2 }),
        }),
      ]);
      const sprites = pieces.sprites().filter((sprite) => sprite.owner === knight.identifier);
      expect(sprites.filter((sprite) => sprite.hidden).length).toBeGreaterThan(0);
      expect(sprites.filter((sprite) => !sprite.hidden).map((sprite) => sprite.id)).toEqual([
        `${knight.identifier}#pedestal`,
      ]);
    });

    it('fits the model inside the size asked for its picture, tipped over and lifted as the picture is', () => {
      vi.spyOn(TestBed.inject(ModelStorage), 'get').mockReturnValue({ isReady: true, url: 'blob:knight' } as never);
      const knight = knightAt(100, 200);
      knight.specifyKomaImageFlag = true;
      knight.komaImageHeight = 250;
      knight.roll = 90;
      knight.altitude = 1;

      expect(pieces.models()[0]).toMatchObject({
        footprintPx: 125,
        heightPx: 250,
        rollDeg: 90,
        pivotPx: gridSize / 2,
        altitudePx: gridSize,
      });
    });

    it('walks while this seat moves it', () => {
      const knight = knightAt(100, 200);
      vi.spyOn(TestBed.inject(ModelStorage), 'get').mockReturnValue({ isReady: true, url: 'blob:knight' } as never);

      TestBed.inject(TransientPlacementService).place(knight.identifier, { surface: 'floor', x: 150, y: 200, z: 0 });

      expect(pieces.models()[0]).toMatchObject({ walking: true, foot: { x: 150 + gridSize / 2 } });
    });
  });
});
