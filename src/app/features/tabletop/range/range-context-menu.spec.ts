import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { RangeArea } from '@axe/domain/tabletop/range';
import { CreateObjectMenu } from '@axe/features/tabletop/create-menu/create-object-context-menu';
import { buildRangeContextMenu, buildRangeContextMenuModel } from '@axe/features/tabletop/range/range-context-menu';
import { createSyncTranslate } from '@axe/testing/transloco-testing';

const t = createSyncTranslate('ja');

describe('buildRangeContextMenu', () => {
  it('groups every range action for the 2D menu without changing the ordinary menu', () => {
    const range = RangeArea.create('test', 3, 3, 50);

    try {
      const model = buildRangeContextMenuModel(
        range,
        50,
        { x: 0, y: 0, z: 0 },
        ObjectStore.instance,
        { notifyInventoryUpdate: vi.fn() } as unknown as GameObjectInventoryService,
        { menuAt: vi.fn(() => []) } as CreateObjectMenu,
        vi.fn(),
        vi.fn(),
        t
      );

      expect(model.radialGroups.map((group) => group.name)).toEqual([
        '位置・追従',
        '形状',
        '編集・作成',
        'オブジェクト操作',
      ]);
      const ordinaryActions = model.actions.filter((action) => action.name.length > 0);
      const radialActions = model.radialGroups.flatMap((group) => group.actions);
      expect(new Set(radialActions)).toEqual(new Set(ordinaryActions));
    } finally {
      range.destroy();
    }
  });

  /** The flat menu of a range on a table of 50px cells, handing the range to `onEdit` for its sheet. */
  function menuOf(range: RangeArea, onEdit: (r: RangeArea) => void = vi.fn()) {
    return buildRangeContextMenu(
      range,
      50,
      { x: 0, y: 0, z: 0 },
      ObjectStore.instance,
      { notifyInventoryUpdate: vi.fn() } as unknown as GameObjectInventoryService,
      { menuAt: vi.fn(() => []) } as CreateObjectMenu,
      vi.fn(),
      onEdit,
      t
    );
  }

  function shapeMenuOf(range: RangeArea) {
    return menuOf(range).find((action) => action.name === '形状変更');
  }

  it('turns free placement on and off among where the range lies, ticked while it is on', () => {
    const range = RangeArea.create('test', 3, 3, 50);
    try {
      const entry = () => menuOf(range).find((action) => action.name.endsWith('自由配置'))!;
      expect(entry().name).toBe('自由配置');

      entry().action!();
      expect(range.freePlacement).toBe(true);
      expect(entry().name).toBe('✔ 自由配置');
      entry().action!();
      expect(range.freePlacement).toBe(false);
    } finally {
      range.destroy();
    }
  });

  it('offers every shape a range can take, ticking the one it has', () => {
    const range = RangeArea.create('test', 1, 1, 50);
    range.type = 'CIRCLE';

    try {
      expect(shapeMenuOf(range)?.subActions?.map((action) => action.name)).toEqual([
        '直線',
        'コーン',
        '三角形（キャラ中心）',
        '四角形・ダイヤ',
        '五角形',
        '六角形',
        '✔ 円形',
        '任意マス',
      ]);
    } finally {
      range.destroy();
    }
  });

  it('hands the range to its sheet from editing it', () => {
    const range = RangeArea.create('test', 1, 1, 50);
    const onEdit = vi.fn();

    try {
      menuOf(range, onEdit).find((action) => action.name === '射程範囲を編集')!.action!();
      expect(onEdit).toHaveBeenCalledWith(range);
    } finally {
      range.destroy();
    }
  });

  it('makes an unlocked copy a cell down and across, and deletes the range', () => {
    const range = RangeArea.create('test', 1, 1, 50);
    const copy = RangeArea.create('test', 1, 1, 50);
    copy.location.x = 100;
    copy.location.y = 150;
    copy.isLock = true;
    const clone = vi.spyOn(range, 'clone').mockReturnValue(copy);

    try {
      menuOf(range).find((action) => action.name === 'コピーを作る')!.action!();
      expect(clone).toHaveBeenCalledOnce();
      expect([copy.location.x, copy.location.y, copy.isLock]).toEqual([150, 200, false]);

      menuOf(range).find((action) => action.name === '削除する')!.action!();
      expect(ObjectStore.instance.get(range.identifier)).toBeNull();
    } finally {
      copy.destroy();
      range.destroy();
    }
  });

  it('offers the square drawn as a diamond or square to the grid, under the square', () => {
    const range = RangeArea.create('test', 1, 1, 50);
    range.type = 'SQUARE';

    try {
      const square = shapeMenuOf(range)?.subActions?.find((action) => action.name.endsWith('四角形・ダイヤ'));
      expect(square?.name).toBe('✔ 四角形・ダイヤ');
      expect(square?.action).toBeUndefined();
      expect(square?.subActions?.map((action) => action.name)).toEqual(['ダイヤとして出力', '✔ 四角形として出力']);

      square!.subActions![0].action!();
      expect(range.type).toBe('RHOMBUS');
      const again = shapeMenuOf(range)?.subActions?.find((action) => action.name.endsWith('四角形・ダイヤ'));
      expect(again?.subActions?.map((action) => action.name)).toEqual(['✔ ダイヤとして出力', '四角形として出力']);
    } finally {
      range.destroy();
    }
  });

  it('lets a diamond follow a character as a square can', () => {
    const range = RangeArea.create('test', 1, 1, 50);
    range.type = 'RHOMBUS';

    try {
      const model = buildRangeContextMenuModel(
        range,
        50,
        { x: 0, y: 0, z: 0 },
        ObjectStore.instance,
        { notifyInventoryUpdate: vi.fn() } as unknown as GameObjectInventoryService,
        { menuAt: vi.fn(() => []) } as CreateObjectMenu,
        vi.fn(),
        vi.fn(),
        t
      );

      expect(model.actions.map((action) => action.name)).toContain(t('feature.tabletop.contextMenu.followCharacter'));
    } finally {
      range.destroy();
    }
  });

  it('offers aiming at everything inside for a circle, a line or a square, and not for other shapes', () => {
    const range = RangeArea.create('test', 3, 3, 50);
    const aim = vi.fn();
    const names = () =>
      buildRangeContextMenu(
        range,
        50,
        { x: 0, y: 0, z: 0 },
        ObjectStore.instance,
        { notifyInventoryUpdate: vi.fn() } as unknown as GameObjectInventoryService,
        { menuAt: vi.fn(() => []) } as CreateObjectMenu,
        vi.fn(),
        vi.fn(),
        t,
        undefined,
        aim
      );

    try {
      range.type = 'CIRCLE';
      const entry = names().find((action) => action.name === '範囲内を対象にする');
      expect(entry).toBeDefined();
      entry!.action!();
      expect(aim).toHaveBeenCalledWith(range);

      range.type = 'CORN';
      expect(names().some((action) => action.name === '範囲内を対象にする')).toBe(false);
    } finally {
      range.destroy();
    }
  });
});
