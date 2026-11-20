import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { WhiteBoardService } from '@axe/application/tabletop/white-board.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Coin } from '@axe/domain/coin/coin';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { RangeArea } from '@axe/domain/tabletop/range';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { waitFor } from '@axe/testing/wait-for';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('WhiteBoardService', () => {
  let boards: WhiteBoardService;
  let board: WhiteBoard;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.inject(TabletopService);
    boards = TestBed.inject(WhiteBoardService);
    board = WhiteBoard.create('board', 4, 3, 1);
    board.location = { name: 'table', x: 100, y: 200 };
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('takes a board down with a coin, a light and a range on it put back where they appeared to be', () => {
    const coin = Coin.create('coin');
    coin.location = { name: 'table', x: 10, y: 20, surface: board.identifier };
    const light = LightSource.create('light');
    light.location = { name: 'table', x: 30, y: 40, surface: board.identifier };
    const range = RangeArea.create('range', 3, 5, 1);
    range.location = { name: 'table', x: 50, y: 60, surface: board.identifier };

    boards.takeDown(board);

    expect(ObjectStore.instance.get(board.identifier)).toBeNull();
    expect([coin.location.surface, coin.location.x, coin.location.y]).toEqual([undefined, 110, 220]);
    expect([light.location.surface, light.location.x, light.location.y]).toEqual([undefined, 130, 240]);
    expect([range.location.surface, range.location.x, range.location.y]).toEqual([undefined, 150, 260]);
  });

  it('takes off only what stands on the board it is asked about', () => {
    const other = WhiteBoard.create('other', 1, 1, 1);
    const piece = GameCharacter.create('piece', 1, '');
    piece.location = { name: 'table', x: 10, y: 10, surface: other.identifier };

    boards.takeOff(board, piece);

    expect(piece.location.surface).toBe(other.identifier);
  });

  it('follows a thing of a kind already in the room being set on the board, for a list read in a computed', async () => {
    const coin = Coin.create('coin');
    const standing = computed(() => boards.standingOn(board).map((object) => object.identifier));
    expect(standing()).toEqual([]);

    coin.location = { name: 'table', x: 10, y: 10, surface: board.identifier };

    await waitFor(() => standing().length > 0, { description: 'the coin to be listed on the board' });
    expect(standing()).toEqual([coin.identifier]);
  });

  it('follows the first thing of a kind new to the room being set on the board', async () => {
    const standing = computed(() => boards.standingOn(board).map((object) => object.identifier));
    expect(standing()).toEqual([]);
    const light = LightSource.create('light');
    expect(standing()).toEqual([]);

    light.location = { name: 'table', x: 10, y: 10, surface: board.identifier };

    await waitFor(() => standing().length > 0, { description: 'the light to be listed on the board' });
    expect(standing()).toEqual([light.identifier]);
  });
});
