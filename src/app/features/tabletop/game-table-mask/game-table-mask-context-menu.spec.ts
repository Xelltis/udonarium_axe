import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { CreateObjectMenu } from '@axe/features/tabletop/create-menu/create-object-context-menu';
import { buildGameTableMaskContextMenu } from '@axe/features/tabletop/game-table-mask/game-table-mask-context-menu';
import { createSyncTranslate } from '@axe/testing/transloco-testing';

const t = createSyncTranslate('ja');

interface MutableMask {
  isLock: boolean;
  dispLockMark: boolean;
  isMine: boolean;
  altitude: number;
  isAltitudeIndicate: boolean;
  parent: null;
  clone: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function makeMask(overrides: Partial<MutableMask> = {}): MutableMask {
  return {
    isLock: false,
    dispLockMark: true,
    isMine: false,
    altitude: 0,
    isAltitudeIndicate: false,
    parent: null,
    clone: vi.fn(() => ({ location: { x: 0, y: 0 }, isLock: false })),
    destroy: vi.fn(),
    ...overrides,
  };
}

function makeService(): GameObjectInventoryService {
  return { notifyInventoryUpdate: vi.fn() } as unknown as GameObjectInventoryService;
}

function makeActionService(): CreateObjectMenu {
  return { menuAt: vi.fn(() => []) } as CreateObjectMenu;
}

function defaultParams(mask: MutableMask) {
  return {
    mask: mask as unknown as GameTableMask,
    gridSize: 50,
    objectPosition: { x: 0, y: 0, z: 0 },
    inventoryService: makeService(),
    createMenu: makeActionService(),
    onStartScratch: vi.fn(),
    onFinishScratch: vi.fn(),
    onCancelScratch: vi.fn(),
    onEdit: vi.fn(),
    t,
  };
}

const names = (a: { name: string }[]) => a.map((x) => x.name);

describe('buildGameTableMaskContextMenu()', () => {
  it('leads with the altitude submenu', () => {
    const menu = buildGameTableMaskContextMenu(defaultParams(makeMask()));
    expect(menu[0].name).toBe('高度設定');
    expect(menu[0].subActions?.length).toBe(2);
  });

  it('offers to lock what is unlocked and to unlock what is not', () => {
    const unlocked = buildGameTableMaskContextMenu(defaultParams(makeMask({ isLock: false })));
    expect(names(unlocked)).toContain('固定する');

    const locked = buildGameTableMaskContextMenu(defaultParams(makeMask({ isLock: true })));
    expect(names(locked)).toContain('固定解除');
  });

  it('offers to hide the lock mark while it is shown', () => {
    const menu = buildGameTableMaskContextMenu(defaultParams(makeMask({ isLock: true, dispLockMark: true })));
    expect(names(menu)).toContain('固定マーク消去');
  });

  it('offers to show it while it is hidden', () => {
    const menu = buildGameTableMaskContextMenu(defaultParams(makeMask({ isLock: true, dispLockMark: false })));
    expect(names(menu)).toContain('固定マーク表示');
  });

  it('offers to start scratching, and once started to finish or cancel it', () => {
    const notMine = buildGameTableMaskContextMenu(defaultParams(makeMask({ isMine: false })));
    expect(names(notMine)).toContain('スクラッチ開始');
    expect(names(notMine)).not.toContain('スクラッチ確定');

    const mine = buildGameTableMaskContextMenu(defaultParams(makeMask({ isMine: true })));
    expect(names(mine)).toContain('スクラッチ確定');
    expect(names(mine)).toContain('スクラッチキャンセル');
  });

  it('starts scratching from the menu', () => {
    const params = defaultParams(makeMask({ isMine: false }));
    const menu = buildGameTableMaskContextMenu(params);
    menu.find((m) => m.name === 'スクラッチ開始')!.action!();
    expect(params.onStartScratch).toHaveBeenCalled();
  });

  it('opens the mask for editing', () => {
    const mask = makeMask();
    const params = defaultParams(mask);
    const menu = buildGameTableMaskContextMenu(params);
    menu.find((m) => m.name === 'マスクを編集')!.action!();
    expect(params.onEdit).toHaveBeenCalledWith(mask);
  });

  it('destroys the mask', () => {
    const mask = makeMask();
    const menu = buildGameTableMaskContextMenu(defaultParams(mask));
    menu.find((m) => m.name === '削除する')!.action!();
    expect(mask.destroy).toHaveBeenCalled();
  });

  it('ends with the usual object-making items in a submenu', () => {
    const params = defaultParams(makeMask());
    (params.createMenu.menuAt as ReturnType<typeof vi.fn>).mockReturnValue([{ name: 'カード作成', action: vi.fn() }]);
    const menu = buildGameTableMaskContextMenu(params);
    const create = menu.find((m) => m.name === 'オブジェクト作成');
    expect(create?.subActions?.length).toBe(1);
    expect(create?.subActions?.[0].name).toBe('カード作成');
  });
});
