import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { TRUMP_BACK_IMAGE_PATH } from '@axe/application/tabletop/tabletop-action-helpers';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card, CardState } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ImageTag } from '@axe/domain/media/image-tag';
import { Party } from '@axe/domain/party/party';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { cellGridOf, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { pieceCellOf } from '@axe/domain/tabletop/move/piece-on-grid';
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

    it('lays a note flat where the writer alone is looking straight down', () => {
      table.mode2d = false;
      TestBed.inject(ViewModePreferenceService).choose('flat');
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

  describe('gatherParty()', () => {
    const position = { x: 225, y: 225, z: 0 };
    let table: GameTable;
    const made: (Party | GameCharacter)[] = [];
    const wasMe = PeerCursor.myCursor;

    beforeEach(() => {
      table = new GameTable();
      table.width = 10;
      table.height = 10;
      table.gridSize = 50;
      table.initialize();
      TableSelecter.instance.viewTableIdentifier = table.identifier;
      PeerCursor.myCursor = { userId: 'gm', role: PeerRole.GameMaster, isGameMaster: true } as PeerCursor;
    });

    afterEach(() => {
      PeerCursor.myCursor = wasMe;
      for (const object of made.splice(0)) object.destroy();
      table.destroy();
    });

    const makeParty = (name: string): Party => {
      const party = new Party();
      party.name = name;
      party.initialize();
      made.push(party);
      return party;
    };

    const makeMember = (party: Party | null, name: string, onTable = true): GameCharacter => {
      const character = GameCharacter.create(name, 1, '');
      character.partyIdentifier = party?.identifier ?? '';
      character.setLocation(onTable ? 'table' : 'graveyard');
      character.location.x = 0;
      character.location.y = 0;
      made.push(character);
      return character;
    };

    const grid = () => cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const cellOf = (character: GameCharacter): number => pieceCellOf(grid(), character, table.gridSize);
    const askedCell = () => cellIndexAt(grid(), position.x, position.y);
    const entries = () => service.getGatherPartyMenu(position)[0]?.subActions ?? [];

    it('offers nothing to anybody but the master', () => {
      makeMember(makeParty('パーティA'), '花子');
      PeerCursor.myCursor = { userId: 'pl', role: PeerRole.Player, isGameMaster: false } as PeerCursor;

      expect(service.getGatherPartyMenu(position)).toEqual([]);
    });

    it('offers nothing in a room that keeps no parties', () => {
      expect(service.getGatherPartyMenu(position)).toEqual([]);
    });

    it('names every party the room keeps', () => {
      makeMember(makeParty('パーティA'), '花子');
      makeMember(makeParty('パーティB'), '太郎');

      expect(entries().map((entry) => entry.name)).toEqual(['パーティA', 'パーティB']);
    });

    it('offers a party nobody belongs to without letting it be picked', () => {
      makeParty('空のパーティ');

      expect(entries()[0].enabled).toBe(false);
      expect(entries()[0].action).toBeUndefined();
    });

    it('offers a party with members put away as two entries, counted', () => {
      // Read before it is picked rather than asked about afterwards: one entry moves what is
      // already on the table, the other brings the rest in as well.
      const party = makeParty('パーティB');
      makeMember(party, '花子');
      makeMember(party, '太郎');
      makeMember(party, '次郎', false);

      expect(entries().map((entry) => entry.name)).toEqual(['パーティB（卓上の2体）', 'パーティB（卓外の1体も出す）']);
    });

    it('offers only the one entry once every member is on the table', () => {
      const party = makeParty('パーティA');
      makeMember(party, '花子');
      makeMember(party, '太郎');

      expect(entries().map((entry) => entry.name)).toEqual(['パーティA']);
    });

    it('stands the party around the spot it was asked for', () => {
      const party = makeParty('パーティA');
      const members = [makeMember(party, '花子'), makeMember(party, '太郎'), makeMember(party, '次郎')];

      const placed = service.gatherParty(position, party);

      expect(placed).toBe(3);
      const cells = members.map(cellOf);
      expect(cells).toContain(askedCell());
      expect(new Set(cells).size).toBe(3);
      expect(cells).not.toContain(pieceCellOf(grid(), members[0], table.gridSize, { x: 0, y: 0 }));
    });

    it('leaves a member that is not on the table where it is', () => {
      const party = makeParty('パーティA');
      const here = makeMember(party, '花子');
      const away = makeMember(party, '次郎', false);

      const placed = service.gatherParty(position, party);

      expect(placed).toBe(1);
      expect(away.isVisibleOnTable).toBe(false);
      expect(away.location.x).toBe(0);
      expect(cellOf(here)).toBe(askedCell());
    });

    it('brings the rest onto the table when that is what was picked', () => {
      const party = makeParty('パーティA');
      const here = makeMember(party, '花子');
      const away = makeMember(party, '次郎', false);

      const placed = service.gatherParty(position, party, true);

      expect(placed).toBe(2);
      expect(away.isVisibleOnTable).toBe(true);
      expect([cellOf(here), cellOf(away)]).toContain(askedCell());
      expect(cellOf(away)).not.toBe(cellOf(here));
    });

    it('leaves a member brought in with no room to stand in off the table', () => {
      table.width = 1;
      table.height = 1;
      const party = makeParty('パーティA');
      makeMember(party, '花子');
      const away = makeMember(party, '次郎', false);

      const placed = service.gatherParty({ x: 25, y: 25, z: 0 }, party, true);

      expect(placed).toBe(1);
      expect(away.isVisibleOnTable).toBe(false);
    });

    it('tells the room and this screen about every piece it moved', () => {
      // A piece moved only in this browser is the worst of the failures this can have: the
      // master sees the party gathered and nobody else does. Both readings are taken from
      // state rather than from what was called, so the check holds however it is carried out.
      const party = makeParty('パーティA');
      const members = [makeMember(party, '花子'), makeMember(party, '太郎')];
      const objectChange = TestBed.inject(ObjectChangeService);
      const announced = members.map((member) => member.majorVersion);
      const seen = members.map((member) => objectChange.versionOf(member.identifier)());

      service.gatherParty(position, party);

      members.forEach((member, index) => {
        expect(member.majorVersion).toBeGreaterThan(announced[index]);
        expect(objectChange.versionOf(member.identifier)()).toBeGreaterThan(seen[index]);
      });
    });

    it('leaves alone a piece that belongs to no party', () => {
      const party = makeParty('パーティA');
      makeMember(party, '花子');
      const outsider = makeMember(null, '通行人');
      outsider.location.x = 225;
      outsider.location.y = 225;
      const stood = cellOf(outsider);

      service.gatherParty(position, party);

      expect(cellOf(outsider)).toBe(stood);
    });

    it('does not stand the party on ground somebody else holds', () => {
      const party = makeParty('パーティA');
      const member = makeMember(party, '花子');
      const outsider = makeMember(null, '通行人');
      outsider.location.x = 200;
      outsider.location.y = 200;

      service.gatherParty(position, party);

      expect(cellOf(member)).not.toBe(cellOf(outsider));
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
