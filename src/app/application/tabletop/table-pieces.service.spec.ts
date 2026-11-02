import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ImageService } from '@axe/application/storage/image.service';
import { PictureSizeService } from '@axe/application/storage/picture-size.service';
import { PiecePicturesService } from '@axe/application/tabletop/piece-pictures.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TextNote } from '@axe/domain/tabletop/text-note';
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

  it('draws a die this seat is moving where it is being moved to', () => {
    const die = dieAt(100, 200);
    pieces.sprites();

    TestBed.inject(TransientPlacementService).place(die.identifier, { surface: 'floor', x: 300, y: 400, z: 0 });

    expect(pieces.sprites()[0].centre).toEqual({ x: 300 + gridSize / 2, y: 400 + gridSize / 2, z: 1 });
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
});
