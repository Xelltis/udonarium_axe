import { TestBed } from '@angular/core/testing';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { TRUMP_BACK_IMAGE_PATH } from '@axe/application/tabletop/tabletop-action-helpers';
import { TabletopDisplaySettingsService } from '@axe/application/ui/tabletop-display-settings.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card, CardState } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { ImageTag } from '@axe/domain/media/image-tag';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { MAX_BOARD_PITCH } from '@axe/domain/tabletop/white-board';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TabletopActionService', () => {
  let service: TabletopActionService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(TabletopActionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('createTextNote()', () => {
    let table: GameTable;

    beforeEach(() => {
      table = new GameTable();
      table.initialize();
      TableSelecter.instance.viewTableIdentifier = table.identifier;
    });

    afterEach(() => {
      table.destroy();
    });

    it('lays a newly created note flat in 2D mode', () => {
      table.mode2d = true;
      const note = service.createTextNote({ x: 0, y: 0, z: 0 });

      expect(note.isUpright).toBe(false);
      note.destroy();
    });

    it('keeps a newly created note upright outside 2D mode', () => {
      table.mode2d = false;
      const note = service.createTextNote({ x: 0, y: 0, z: 0 });

      expect(note.isUpright).toBe(true);
      note.destroy();
    });

    it('lays a note flat when only this browser uses tabletop display mode', () => {
      table.mode2d = false;
      TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: true });
      const note = service.createTextNote({ x: 0, y: 0, z: 0 });

      expect(note.isUpright).toBe(false);
      note.destroy();
    });
  });

  describe('createBlankCard()', () => {
    it('creates a standalone card with the blank face at the clicked position', () => {
      const card = service.createBlankCard({ x: 100, y: 120, z: 3 });

      expect(card instanceof Card).toBe(true);
      expect(card.location.x).toBe(75);
      expect(card.location.y).toBe(95);
      expect(card.posZ).toBe(3);
      expect(card.state).toBe(CardState.FRONT);
      expect(card.owner).toBe('');
      expect(card.frontImage?.url).toContain('blank_card.webp');
      expect(card.backImage?.url).toBe(TRUMP_BACK_IMAGE_PATH);
      expect(card.imageFile.url).toContain('blank_card.webp');
    });

    it('adds a blank-card action to the context menu', () => {
      const action = service
        .makeDefaultContextMenuActions({ x: 0, y: 0, z: 0 })
        .find((entry) => entry.name === 'ブランクカードを作成');

      expect(action).toBeDefined();
      expect(action?.action).toBeInstanceOf(Function);
    });
  });

  describe('createWhiteBoard()', () => {
    let table: GameTable;

    beforeEach(() => {
      table = new GameTable();
      table.width = 20;
      table.height = 15;
      table.gridSize = 50;
      table.initialize();
      TableSelecter.instance.viewTableIdentifier = table.identifier;
    });

    afterEach(() => {
      table.destroy();
    });

    it('puts a board up standing, the size of the table it stands behind', () => {
      const board = service.createWhiteBoard({ x: 300, y: 400, z: 0 });

      // Laid flat over the middle of the table it would cover the thing everyone is looking at.
      expect(board.pitch).toBe(MAX_BOARD_PITCH);
      expect(board.width).toBe(table.width);
      expect(board.height).toBe(table.height);
    });

    it('stands it a square clear of the north edge, whatever was clicked', () => {
      const board = service.createWhiteBoard({ x: 300, y: 400, z: 0 });
      const grid = table.gridSize;

      // Standing, it hinges on its bottom edge, so that edge is the square north of the table.
      expect(board.location.x).toBe(0);
      expect(board.location.y + board.height * grid).toBe(-grid);
    });

    it('belongs to its table, so clearing the table clears it', () => {
      const board = service.createWhiteBoard({ x: 0, y: 0, z: 0 });

      expect(table.whiteBoards.map((entry) => entry.identifier)).toContain(board.identifier);
    });

    it('sets a second board down beside the first rather than on top of it', () => {
      const first = service.createWhiteBoard({ x: 0, y: 0, z: 0 });
      const second = service.createWhiteBoard({ x: 0, y: 0, z: 0 });

      expect(second.location.x).not.toBe(first.location.x);
      expect(table.whiteBoards).toHaveLength(2);
    });

    it('lines them up along the same edge, a board width and a square apart', () => {
      service.createWhiteBoard({ x: 0, y: 0, z: 0 });
      const second = service.createWhiteBoard({ x: 0, y: 0, z: 0 });
      const third = service.createWhiteBoard({ x: 0, y: 0, z: 0 });
      const step = table.width * table.gridSize + table.gridSize;

      expect(second.location.x).toBe(step);
      expect(third.location.x).toBe(step * 2);
      expect(new Set([second.location.y, third.location.y]).size).toBe(1);
    });

    it('fills a gap left by a board that has been taken away', () => {
      const first = service.createWhiteBoard({ x: 0, y: 0, z: 0 });
      service.createWhiteBoard({ x: 0, y: 0, z: 0 });
      first.destroy();

      expect(service.createWhiteBoard({ x: 0, y: 0, z: 0 }).location.x).toBe(0);
    });
  });

  describe('createDeckFromTag()', () => {
    const position = { x: 100, y: 120, z: 0 };
    const created: { destroy(): void }[] = [];

    function taggedImage(url: string, name: string, tag: string): string {
      const image = ImageStorage.instance.add(url);
      image.context.name = name;
      const imageTag = ImageTag.create(image.identifier);
      imageTag.tag = tag;
      created.push(imageTag);
      return image.identifier;
    }

    afterEach(() => {
      for (const object of created.splice(0)) object.destroy();
      for (const stack of ObjectStore.instance.getObjects<CardStack>(CardStack)) stack.destroy();
      for (const image of ImageStorage.instance.images) ImageStorage.instance.delete(image.identifier);
    });

    it('builds a deck with one card per tagged image', () => {
      taggedImage('test://deck/dragon.png', 'ドラゴン.png', 'デッキA');
      taggedImage('test://deck/mage.png', '魔道士.png', 'デッキA');
      taggedImage('test://deck/other.png', 'よそのカード.png', 'デッキB');

      const stack = service.createDeckFromTag(position, 'デッキA', true);

      expect(stack).not.toBeNull();
      expect(stack!.cards).toHaveLength(2);
      expect(stack!.cards.map((card) => card.name).sort()).toEqual(['ドラゴン', '魔道士']);
      expect(stack!.name).toBe('デッキA');
    });

    it('names the cards by default when the image names are not wanted', () => {
      taggedImage('test://deck/knight.png', '騎士.png', 'デッキC');

      const stack = service.createDeckFromTag(position, 'デッキC', false);

      expect(stack!.cards[0].name).not.toBe('騎士');
    });

    it('builds no deck when no image matches', () => {
      expect(service.createDeckFromTag(position, '空のタグ', true)).toBeNull();
    });
  });
});
