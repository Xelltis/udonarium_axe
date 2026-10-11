import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { RangeArea } from '@axe/domain/tabletop/range';
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
        { makeDefaultContextMenuActions: vi.fn(() => []) } as unknown as TabletopActionService,
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

  function shapeMenuOf(range: RangeArea) {
    const actions = buildRangeContextMenu(
      range,
      50,
      { x: 0, y: 0, z: 0 },
      ObjectStore.instance,
      { notifyInventoryUpdate: vi.fn() } as unknown as GameObjectInventoryService,
      { makeDefaultContextMenuActions: vi.fn(() => []) } as unknown as TabletopActionService,
      vi.fn(),
      vi.fn(),
      t
    );
    return actions.find((action) => action.name === '形状変更');
  }

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
        { makeDefaultContextMenuActions: vi.fn(() => []) } as unknown as TabletopActionService,
        vi.fn(),
        vi.fn(),
        t
      );

      expect(model.actions.map((action) => action.name)).toContain(t('feature.tabletop.contextMenu.followCharacter'));
    } finally {
      range.destroy();
    }
  });
});
