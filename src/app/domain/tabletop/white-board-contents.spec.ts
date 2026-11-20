import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { clearBoard, detachFromBoard, standingOnBoard } from '@axe/domain/tabletop/white-board-contents';

describe('white board contents', () => {
  let board: WhiteBoard;

  function setOn(object: TabletopObject, x: number, y: number, surface?: string): TabletopObject {
    object.location = { name: 'table', x, y, surface };
    return object;
  }

  function piece(x: number, y: number, surface?: string): GameCharacter {
    return setOn(GameCharacter.create('piece', 1, ''), x, y, surface) as GameCharacter;
  }

  beforeEach(() => {
    board = WhiteBoard.create('board', 4, 3, 1);
    board.location = { name: 'table', x: 100, y: 200 };
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it.each<[string, () => TabletopObject]>([
    ['a piece', () => GameCharacter.create('piece', 1, '')],
    ['a block', () => Terrain.create('block', 1, 1, 1, '', '')],
    ['a mask', () => GameTableMask.create('mask', 1, 1, 1)],
    ['a note', () => TextNote.create('note', 'text')],
    ['a card', () => Card.create('card', '', '')],
    ['a stack of cards', () => CardStack.create('stack')],
    ['a die', () => DiceSymbol.create('die', DiceType.D6, 1)],
    ['a coin', () => Coin.create('coin')],
    ['a light', () => LightSource.create('light')],
    ['a ground effect', () => TableAmbience.create('swamp', 'swamp', 2, 2)],
    ['a range', () => RangeArea.create('range', 3, 5, 1)],
    ['another board', () => WhiteBoard.create('inner', 1, 1, 1)],
  ])('counts %s set on the board', (_, make) => {
    const object = setOn(make(), 10, 10, board.identifier);

    expect(standingOnBoard(board, ObjectStore.instance.getObjects())).toEqual([object]);
  });

  it('counts only what names the board as the face it stands on', () => {
    const mine = piece(10, 10, board.identifier);
    piece(10, 10);
    piece(10, 10, 'north-wall');

    expect(standingOnBoard(board, ObjectStore.instance.getObjects())).toEqual([mine]);
  });

  it('leaves out what is put away, or held in a stack, though its place still names the board', () => {
    const away = piece(10, 10, board.identifier);
    away.location.name = 'graveyard';
    const stack = CardStack.create('stack');
    const held = setOn(Card.create('card', '', ''), 10, 10, board.identifier) as Card;
    stack.putOnTop(held);

    expect(standingOnBoard(board, ObjectStore.instance.getObjects())).toEqual([]);
  });

  it('hands a piece back in the place it appeared to be, not the corner', () => {
    const held = piece(50, 40, board.identifier);

    detachFromBoard(board, held);

    expect(held.location.surface).toBeUndefined();
    expect(held.location.x).toBe(150);
    expect(held.location.y).toBe(240);
  });

  it('clears the board in one go, whatever kind each thing on it is', () => {
    const first = piece(10, 20, board.identifier);
    const coin = setOn(Coin.create('coin'), 30, 40, board.identifier);
    const elsewhere = piece(5, 5);

    clearBoard(board, ObjectStore.instance.getObjects());

    expect(first.location.surface).toBeUndefined();
    expect(coin.location.surface).toBeUndefined();
    expect([first.location.x, first.location.y]).toEqual([110, 220]);
    expect([coin.location.x, coin.location.y]).toEqual([130, 240]);
    expect([elsewhere.location.x, elsewhere.location.y]).toEqual([5, 5]);
  });
});
