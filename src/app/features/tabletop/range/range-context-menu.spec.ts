import { TranslateFn } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { SoundEffect } from '@axe/domain/media/sound-effect';
import { RangeArea } from '@axe/domain/tabletop/range';
import { CreateObjectMenu } from '@axe/features/tabletop/create-menu/create-object-context-menu';
import { buildRangeContextMenuModel } from '@axe/features/tabletop/range/range-context-menu';
import { createSyncTranslate } from '@axe/testing/transloco-testing';

const t = createSyncTranslate('ja');

describe('buildRangeContextMenuModel', () => {
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
    return buildRangeContextMenuModel(
      range,
      50,
      { x: 0, y: 0, z: 0 },
      ObjectStore.instance,
      { notifyInventoryUpdate: vi.fn() } as unknown as GameObjectInventoryService,
      { menuAt: vi.fn(() => []) } as CreateObjectMenu,
      vi.fn(),
      onEdit,
      t
    ).actions;
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

  it('offers aiming at everything inside for a circle, a line or a square, and not for other flat shapes, and for every shape standing up', () => {
    const range = RangeArea.create('test', 3, 3, 50);
    const aim = vi.fn();
    const names = () =>
      buildRangeContextMenuModel(
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
      ).actions;

    try {
      range.type = 'CIRCLE';
      const entry = names().find((action) => action.name === '範囲内を対象にする');
      expect(entry).toBeDefined();
      entry!.action!();
      expect(aim).toHaveBeenCalledWith(range);

      range.type = 'CORN';
      expect(names().some((action) => action.name === '範囲内を対象にする')).toBe(false);

      range.solidKind = 'cone';
      expect(names().some((action) => action.name === '範囲内を対象にする')).toBe(true);
      range.type = 'PENTAGON';
      expect(names().some((action) => action.name === '範囲内を対象にする')).toBe(true);
    } finally {
      range.destroy();
    }
  });
});

describe('standing a range up from its menu', () => {
  const t = ((key: string) => key) as TranslateFn;

  function solidEntries(range: RangeArea) {
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
    return model.actions.find((action) => action.name === 'feature.tabletop.contextMenu.solid')!.subActions!;
  }

  it('offers the kinds the shape can stand up as, ticking the one it stands up as, and sets the one picked', () => {
    vi.spyOn(SoundEffect, 'play').mockImplementation(() => undefined);
    const range = RangeArea.create('test', 3, 3, 50);
    range.type = 'CIRCLE';
    try {
      expect(solidEntries(range).map((entry) => entry.name)).toEqual([
        '✔ feature.tabletop.contextMenu.solidFlat',
        'feature.tabletop.contextMenu.solidColumn',
        'feature.tabletop.contextMenu.solidSphere',
      ]);
      solidEntries(range)[2].action!();
      expect(range.solidKind).toBe('sphere');
      range.type = 'HEXAGON';
      expect(solidEntries(range).map((entry) => entry.name)).toEqual([
        'feature.tabletop.contextMenu.solidFlat',
        '✔ feature.tabletop.contextMenu.solidColumn',
      ]);
    } finally {
      range.destroy();
    }
  });

  it('levels a cone again, and puts a sphere following a piece back onto it', () => {
    vi.spyOn(SoundEffect, 'play').mockImplementation(() => undefined);
    const cone = RangeArea.create('cone', 3, 3, 50);
    cone.type = 'CORN';
    cone.solidKind = 'cone';
    cone.aimPitch = 40;
    const piece = GameCharacter.create('piece', 1, '');
    piece.location = { name: 'table', x: 100, y: 100 };
    const sphere = RangeArea.create('sphere', 3, 3, 50);
    sphere.type = 'CIRCLE';
    sphere.solidKind = 'sphere';
    sphere.casterOffset = { x: 2, y: 1 };
    sphere.followingCharacterIdentifier = piece.identifier;
    try {
      solidEntries(cone).find((entry) => entry.name.endsWith('solidLevel'))!.action!();
      expect(cone.aimPitch).toBe(0);
      solidEntries(sphere).find((entry) => entry.name.endsWith('solidBackToCaster'))!.action!();
      expect(sphere.casterOffset).toEqual({ x: 0, y: 0 });
      expect([sphere.location.x, sphere.location.y]).toEqual([125, 125]);
    } finally {
      cone.destroy();
      sphere.destroy();
      piece.destroy();
    }
  });
});

describe('letting a range go of the piece it follows', () => {
  const t = ((key: string) => key) as TranslateFn;

  it('offers it for a range following a piece whatever its shape, as a line stood up and laid flat again', () => {
    const piece = GameCharacter.create('piece', 1, '');
    const range = RangeArea.create('line', 1, 4, 50);
    range.type = 'LINE';
    range.followingCharacterIdentifier = piece.identifier;
    try {
      const names = buildRangeContextMenuModel(
        range,
        50,
        { x: 0, y: 0, z: 0 },
        ObjectStore.instance,
        { notifyInventoryUpdate: vi.fn() } as unknown as GameObjectInventoryService,
        { menuAt: vi.fn(() => []) } as CreateObjectMenu,
        vi.fn(),
        vi.fn(),
        t
      ).actions.map((action) => action.name);

      expect(names).toContain('feature.tabletop.contextMenu.unfollow');
    } finally {
      range.destroy();
      piece.destroy();
    }
  });
});
