import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import {
  buildInventoryFolderAssignMenu,
  buildInventoryFolderContextMenu,
  buildInventoryMultiMoveContextMenu,
  buildInventoryObjectContextMenu,
} from '@axe/features/inventory/game-object-inventory/game-object-inventory-context-menu';
import { createSyncTranslate } from '@axe/testing/transloco-testing';

const t = createSyncTranslate('ja');

function makeService(): GameObjectInventoryService {
  return { notifyInventoryUpdate: vi.fn() } as unknown as GameObjectInventoryService;
}

function makeCharacterAt(locationName: string, hideInventory = false): TabletopObject {
  return {
    name: 'taro',
    location: { name: locationName },
    setLocation: vi.fn(),
    hideInventory,
  } as unknown as TabletopObject;
}

function names(actions: { name: string }[]): string[] {
  return actions.map((a) => a.name);
}

const defaultCallbacks = () => ({
  showDetail: vi.fn(),
  showChatPalette: vi.fn(),
  showRemoteController: vi.fn(),
  focusOnTable: vi.fn(),
  cloneGameObject: vi.fn(),
  deleteGameObject: vi.fn(),
  setFolder: vi.fn(),
  createFolder: vi.fn(),
});

const folderCallbacks = () => ({ setFolder: vi.fn(), createFolder: vi.fn() });

describe('buildInventoryObjectContextMenu()', () => {
  it('offers to show a piece standing on the table where it stands, for a screen that cannot double-click', () => {
    const character = makeCharacterAt('table');
    const callbacks = defaultCallbacks();
    const actions = buildInventoryObjectContextMenu(character, makeService(), callbacks, t);
    const show = actions.find((action) => action.name === '卓で表示');

    expect(show).toBeTruthy();
    show?.action?.();
    expect(callbacks.focusOnTable).toHaveBeenCalledWith(character);
  });

  it('leaves showing it on the table out for a piece that is not there', () => {
    for (const where of ['common', 'graveyard']) {
      const actions = buildInventoryObjectContextMenu(makeCharacterAt(where), makeService(), defaultCallbacks(), t);
      expect(names(actions)).not.toContain('卓で表示');
    }
  });

  it('offers the folders as a submenu', () => {
    const character = makeCharacterAt('table');
    const actions = buildInventoryObjectContextMenu(character, makeService(), defaultCallbacks(), t, ['第1話']);
    const folder = actions.find((action) => action.name === 'フォルダ');

    expect(folder?.subActions).toBeTruthy();
    expect(names(folder!.subActions!)).toContain('○ 第1話');
  });

  it('offers them in the graveyard too', () => {
    const character = makeCharacterAt('graveyard');
    const actions = buildInventoryObjectContextMenu(character, makeService(), defaultCallbacks(), t, ['第1話']);

    expect(names(actions)).toContain('フォルダ');
  });

  it('leaves them out where folders do not apply', () => {
    const character = makeCharacterAt('table');
    const actions = buildInventoryObjectContextMenu(character, makeService(), defaultCallbacks(), t, null);

    expect(names(actions)).not.toContain('フォルダ');
  });

  it('offers the sheet, the palette, the remote and hiding from the list anywhere but the graveyard', () => {
    const character = makeCharacterAt('table');
    const actions = buildInventoryObjectContextMenu(character, makeService(), defaultCallbacks(), t);
    const list = names(actions);
    expect(list).toContain('詳細を表示');
    expect(list).toContain('チャットパレットを表示');
    expect(list).toContain('リモコンを表示');
    expect(list.some((n) => n.includes('インベントリ非表示'))).toBe(true);
  });

  it('offers the sheet alone there, without the palette or the remote', () => {
    const character = makeCharacterAt('graveyard');
    const actions = buildInventoryObjectContextMenu(character, makeService(), defaultCallbacks(), t);
    const list = names(actions);
    expect(list).toContain('詳細を表示');
    expect(list).not.toContain('チャットパレットを表示');
    expect(list).not.toContain('リモコンを表示');
  });

  it('leaves out the place it is already in', () => {
    const character = makeCharacterAt('table');
    const actions = buildInventoryObjectContextMenu(character, makeService(), defaultCallbacks(), t);
    const list = names(actions);
    expect(list).not.toContain('テーブルに移動');
    expect(list).toContain('共有イベントリに移動');
    expect(list).toContain('墓場に移動');
  });

  it('offers deleting in the graveyard alone', () => {
    const graveyardActions = buildInventoryObjectContextMenu(
      makeCharacterAt('graveyard'),
      makeService(),
      defaultCallbacks(),
      t
    );
    expect(names(graveyardActions)).toContain('削除する');

    const tableActions = buildInventoryObjectContextMenu(
      makeCharacterAt('table'),
      makeService(),
      defaultCallbacks(),
      t
    );
    expect(names(tableActions)).not.toContain('削除する');
  });

  it('ticks the item by whether it is hidden from the list', () => {
    const visible = buildInventoryObjectContextMenu(
      makeCharacterAt('table', false),
      makeService(),
      defaultCallbacks(),
      t
    );
    expect(names(visible)).toContain('☐ インベントリ非表示');

    const hidden = buildInventoryObjectContextMenu(
      makeCharacterAt('table', true),
      makeService(),
      defaultCallbacks(),
      t
    );
    expect(names(hidden)).toContain('☑ インベントリ非表示');
  });

  it('always offers a copy, near the end', () => {
    const actions = buildInventoryObjectContextMenu(makeCharacterAt('table'), makeService(), defaultCallbacks(), t);
    expect(names(actions)).toContain('コピーを作る');
  });

  it('opens the sheet from that item', () => {
    const showDetail = vi.fn();
    const character = makeCharacterAt('table');
    const actions = buildInventoryObjectContextMenu(character, makeService(), { ...defaultCallbacks(), showDetail }, t);
    actions.find((a) => a.name === '詳細を表示')!.action!();
    expect(showDetail).toHaveBeenCalledWith(character as unknown as GameCharacter);
  });
});

describe('buildInventoryMultiMoveContextMenu()', () => {
  const moveCallbacks = () => ({
    multiMove: vi.fn(),
    toggleMultiMove: vi.fn(),
    multiDelete: vi.fn(),
  });

  it('leaves out the place the open tab already names', () => {
    const actions = buildInventoryMultiMoveContextMenu('common', moveCallbacks(), t);
    expect(names(actions)).not.toContain('共有イベントリに移動');
    expect(names(actions)).toContain('テーブルに移動');
    expect(names(actions)).toContain('墓場に移動');
  });

  it('offers deleting from the graveyard while that tab is open', () => {
    const actions = buildInventoryMultiMoveContextMenu('graveyard', moveCallbacks(), t);
    expect(names(actions)).toContain('墓場から削除');
  });

  it('offers it nowhere else', () => {
    const actions = buildInventoryMultiMoveContextMenu('table', moveCallbacks(), t);
    expect(names(actions)).not.toContain('墓場から削除');
  });

  it('moves them all and then leaves the moving mode', () => {
    const multiMove = vi.fn();
    const toggleMultiMove = vi.fn();
    const actions = buildInventoryMultiMoveContextMenu(
      'table',
      { multiMove, toggleMultiMove, multiDelete: vi.fn() },
      t
    );
    actions.find((a) => a.name === '共有イベントリに移動')!.action!();
    expect(multiMove).toHaveBeenCalledWith('common');
    expect(toggleMultiMove).toHaveBeenCalled();
  });
});

describe('buildInventoryFolderAssignMenu()', () => {
  it('offers a new folder even where none has been made yet', () => {
    const actions = buildInventoryFolderAssignMenu('', [], folderCallbacks(), t);

    expect(names(actions)).toEqual(['新しいフォルダ']);
  });

  it('lists the folders that exist and marks the one it is in', () => {
    const actions = buildInventoryFolderAssignMenu('第1話', ['第1話', '第2話'], folderCallbacks(), t);

    expect(names(actions)).toContain('◉ 第1話');
    expect(names(actions)).toContain('○ 第2話');
  });

  it('offers a way out only once it is in a folder', () => {
    const inside = buildInventoryFolderAssignMenu('第1話', ['第1話'], folderCallbacks(), t);
    const outside = buildInventoryFolderAssignMenu('', ['第1話'], folderCallbacks(), t);

    expect(names(inside)).toContain('フォルダから出す');
    expect(names(outside)).not.toContain('フォルダから出す');
  });

  it('offers a way out for a selection whose folders it cannot name as one', () => {
    const actions = buildInventoryFolderAssignMenu(null, ['第1話'], folderCallbacks(), t);

    expect(names(actions)).toContain('フォルダから出す');
    expect(names(actions)).toContain('○ 第1話');
  });

  it('puts the chosen folder on whatever asked for the menu', () => {
    const callbacks = folderCallbacks();
    const actions = buildInventoryFolderAssignMenu('', ['第1話'], callbacks, t);

    actions.find((action) => action.name === '○ 第1話')?.action?.();

    expect(callbacks.setFolder).toHaveBeenCalledWith('第1話');
  });
});

describe('buildInventoryFolderContextMenu()', () => {
  const folderMenuCallbacks = () => ({
    renameFolder: vi.fn(),
    createSubfolder: vi.fn(),
    deleteFolder: vi.fn(),
    selectFolder: vi.fn(),
    collapseAll: vi.fn(),
    expandAll: vi.fn(),
  });

  it('offers renaming, nesting and deleting a folder', () => {
    const list = names(buildInventoryFolderContextMenu('第1話', false, folderMenuCallbacks(), t));

    expect(list).toContain('フォルダ名を変更');
    expect(list).toContain('この中に新しいフォルダ');
    expect(list).toContain('このフォルダを削除');
  });

  it('offers none of them on the unfiled heading', () => {
    const list = names(buildInventoryFolderContextMenu('', false, folderMenuCallbacks(), t));

    expect(list).not.toContain('フォルダ名を変更');
    expect(list).not.toContain('この中に新しいフォルダ');
    expect(list).not.toContain('このフォルダを削除');
  });

  it('offers folding every folder either way', () => {
    const list = names(buildInventoryFolderContextMenu('', false, folderMenuCallbacks(), t));

    expect(list).toContain('すべて折りたたむ');
    expect(list).toContain('すべて展開');
  });

  it('offers no folder inside one that has no room for another level', () => {
    const list = names(buildInventoryFolderContextMenu('第1話', false, folderMenuCallbacks(), t, false));

    expect(list).toContain('フォルダ名を変更');
    expect(list).toContain('このフォルダを削除');
    expect(list).not.toContain('この中に新しいフォルダ');
  });

  it('offers taking the whole folder only while several are being moved', () => {
    const idle = names(buildInventoryFolderContextMenu('第1話', false, folderMenuCallbacks(), t));
    const moving = names(buildInventoryFolderContextMenu('第1話', true, folderMenuCallbacks(), t));

    expect(idle).not.toContain('このフォルダを全選択');
    expect(moving).toContain('このフォルダを全選択');
  });
});
