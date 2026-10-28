import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { LOAD_FAILURE_NOTICE } from '@axe/application/ui/overlay-components';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Party } from '@axe/domain/party/party';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import {
  CreateObjectMenuService,
  DICE_CREATE_DIALOG_LOADER,
} from '@axe/features/tabletop/create-menu/create-object-menu.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** An entry of a menu by its name, at its top or one group down. */
function entryIn(menu: readonly ContextMenuAction[], name: string): ContextMenuAction | undefined {
  return menu.flatMap((entry) => [entry, ...(entry.subActions ?? [])]).find((entry) => entry.name === name);
}

describe('CreateObjectMenuService', () => {
  let menu: CreateObjectMenuService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    menu = TestBed.inject(CreateObjectMenuService);
  });

  it('lists the create menu flat, in the order the table has always offered it', () => {
    const listed = menu.menuAt({ x: 0, y: 0, z: 0 });

    expect(listed.map((entry) => entry.name)).toEqual([
      'キャラクターを作成',
      'マップマスクを作成',
      '地形を作成',
      '共有メモを作成',
      'ブランクカードを作成',
      'トランプの山札を作成',
      'ダイスを作成',
      'コインを作成',
      '射程範囲を作成',
      '光源を作成',
      'ホワイトボードを作成',
      '環境エフェクトを置く',
    ]);
  });

  it('offers a blank card among the cards', () => {
    const action = entryIn(menu.menuAt({ x: 0, y: 0, z: 0 }), 'ブランクカードを作成');

    expect(action).toBeDefined();
    expect(action?.action).toBeInstanceOf(Function);
  });

  describe('the range create menu', () => {
    it('makes the square as a diamond or square to the grid, from under the square', () => {
      const listed = entryIn(menu.menuAt({ x: 0, y: 0, z: 0 }), '射程範囲を作成');
      const square = listed?.subActions?.find((entry) => entry.name === '四角形・ダイヤ');

      expect(square?.action).toBeUndefined();
      expect(square?.subActions?.map((entry) => entry.name)).toEqual(['ダイヤとして出力', '四角形として出力']);

      const before = new Set(ObjectStore.instance.getObjects(RangeArea));
      square!.subActions![0].action!();
      const made = ObjectStore.instance.getObjects(RangeArea).filter((range) => !before.has(range));
      try {
        expect(made.map((range) => range.type)).toEqual(['RHOMBUS']);
      } finally {
        for (const range of made) range.destroy();
      }
    });
  });

  describe('making several dice at once', () => {
    function menuWith(loader: () => Promise<Type<unknown>>, notice: () => void = () => {}): CreateObjectMenuService {
      TestBed.overrideProvider(DICE_CREATE_DIALOG_LOADER, { useValue: loader });
      TestBed.overrideProvider(LOAD_FAILURE_NOTICE, { useValue: notice });
      return TestBed.inject(CreateObjectMenuService);
    }

    const manyEntry = (made: CreateObjectMenuService) =>
      entryIn(made.menuAt({ x: 0, y: 0, z: 0 }), 'ダイスを作成')?.subActions?.find(
        (entry) => entry.name === '個数を指定して作成…'
      );

    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    });

    it('fetches the dialogue when asked for, and asks with it', async () => {
      class Dialog {}
      const made = menuWith(() => Promise.resolve(Dialog));
      const open = vi.spyOn(TestBed.inject(ModalService), 'open').mockResolvedValue(null);

      manyEntry(made)!.action!();

      await vi.waitFor(() => expect(open).toHaveBeenCalledWith(Dialog, expect.anything(), undefined));
    });

    it('says the page wants reloading when the dialogue cannot be fetched, and asks nothing', async () => {
      const told = vi.fn();
      const made = menuWith(() => Promise.reject(new Error('chunk gone')), told);
      const open = vi.spyOn(TestBed.inject(ModalService), 'open');

      manyEntry(made)!.action!();

      await vi.waitFor(() => expect(told).toHaveBeenCalledOnce());
      expect(open).not.toHaveBeenCalled();
    });
  });

  describe('the gather-a-party menu', () => {
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

    const entries = () => menu.gatherPartyMenuAt(position)[0]?.subActions ?? [];

    it('offers nothing to anybody but the master', () => {
      makeMember(makeParty('パーティA'), '花子');
      PeerCursor.myCursor = { userId: 'pl', role: PeerRole.Player, isGameMaster: false } as PeerCursor;

      expect(menu.gatherPartyMenuAt(position)).toEqual([]);
    });

    it('offers nothing in a room that keeps no parties', () => {
      expect(menu.gatherPartyMenuAt(position)).toEqual([]);
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
  });
});
