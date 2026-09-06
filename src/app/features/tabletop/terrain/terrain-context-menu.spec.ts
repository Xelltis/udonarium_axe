import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { DOOR_STYLES, SlopeDirection, Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';
import {
  buildTerrainContextMenu,
  buildTerrainContextMenuModel,
} from '@axe/features/tabletop/terrain/terrain-context-menu';
import { createSyncTranslate } from '@axe/testing/transloco-testing';

const t = createSyncTranslate('ja');

interface MutableTerrain {
  width: number;
  depth: number;
  altitude: number;
  isAltitudeIndicate: boolean;
  isLocked: boolean;
  isSlope: boolean;
  slopeDirection: SlopeDirection;
  hasWall: boolean;
  isSurfaceShading: boolean;
  isDropShadow: boolean;
  isTiledTexture: boolean;
  doorStyle: string;
  isDoorOpen: boolean;
  isDoor: boolean;
  mode: TerrainViewState;
  parent: null;
  clone: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function makeTerrain(overrides: Partial<MutableTerrain> = {}): MutableTerrain {
  return {
    width: 1,
    depth: 1,
    altitude: 0,
    isAltitudeIndicate: false,
    isLocked: false,
    isSlope: false,
    slopeDirection: SlopeDirection.NONE,
    hasWall: true,
    isSurfaceShading: false,
    isDropShadow: false,
    isTiledTexture: false,
    doorStyle: 'none',
    isDoorOpen: false,
    isDoor: false,
    mode: TerrainViewState.ALL,
    parent: null,
    clone: vi.fn(() => ({ location: { x: 0, y: 0 }, isLocked: false })),
    destroy: vi.fn(),
    ...overrides,
  };
}

function makeService(): GameObjectInventoryService {
  return { notifyInventoryUpdate: vi.fn() } as unknown as GameObjectInventoryService;
}

function makeActionService(): TabletopActionService {
  return { makeDefaultContextMenuActions: vi.fn(() => []) } as unknown as TabletopActionService;
}

const names = (a: { name: string }[]) => a.map((x) => x.name);

describe('buildTerrainContextMenu()', () => {
  it('groups every terrain action for the rotating menu', () => {
    const overlapAction = { name: '重なり' };
    const surfaceAction = { name: '北壁へ移動' };
    const model = buildTerrainContextMenuModel(
      makeTerrain() as unknown as Terrain,
      50,
      { x: 0, y: 0, z: 0 },
      makeService(),
      makeActionService(),
      vi.fn(),
      t,
      [overlapAction],
      [surfaceAction]
    );

    expect(model.radialGroups.map((group) => group.name)).toEqual([
      '地形・扉',
      '見た目・照明',
      '移動・作成',
      'オブジェクト操作',
    ]);
    expect(model.radialGroups.find((group) => group.name === '移動・作成')?.actions).toContain(surfaceAction);
    expect(model.radialGroups.find((group) => group.name === 'オブジェクト操作')?.actions).toContain(overlapAction);
    expect(model.actions).toContain(surfaceAction);
    const ordinaryActions = model.actions.filter((action) => action.name.length > 0);
    const radialActions = model.radialGroups.flatMap((group) => group.actions);
    expect(new Set(radialActions)).toEqual(new Set(ordinaryActions));
  });

  it('offers three items for the altitude', () => {
    const menu = buildTerrainContextMenu(
      makeTerrain() as unknown as Terrain,
      50,
      { x: 0, y: 0, z: 0 },
      makeService(),
      makeActionService(),
      vi.fn(),
      t
    );
    expect(menu[0].name).toBe('高度設定');
    expect(menu[0].subActions?.length).toBe(3);
  });

  it('offers to tile a stretched texture and to stretch a tiled one', () => {
    const build = (isTiledTexture: boolean) =>
      buildTerrainContextMenu(
        makeTerrain({ isTiledTexture }) as unknown as Terrain,
        50,
        { x: 0, y: 0, z: 0 },
        makeService(),
        makeActionService(),
        vi.fn(),
        t
      );

    expect(names(build(false))).toContain('テクスチャをタイル貼りにする');
    expect(names(build(true))).toContain('テクスチャを引き伸ばしに戻す');
  });

  it('flips the tiling when that item is chosen', () => {
    const terrain = makeTerrain();
    const menu = buildTerrainContextMenu(
      terrain as unknown as Terrain,
      50,
      { x: 0, y: 0, z: 0 },
      makeService(),
      makeActionService(),
      vi.fn(),
      t
    );

    menu.find((item) => item.name === 'テクスチャをタイル貼りにする')?.action?.();

    expect(terrain.isTiledTexture).toBe(true);
  });

  it('offers to open a door and to shut an open one, and neither to a plain wall', () => {
    const build = (overrides: Partial<MutableTerrain>) =>
      buildTerrainContextMenu(
        makeTerrain(overrides) as unknown as Terrain,
        50,
        { x: 0, y: 0, z: 0 },
        makeService(),
        makeActionService(),
        vi.fn(),
        t
      );

    expect(names(build({ isDoor: true, doorStyle: 'swing' }))).toContain('扉を開く');
    expect(names(build({ isDoor: true, doorStyle: 'swing', isDoorOpen: true }))).toContain('扉を閉じる');
    expect(names(build({}))).not.toContain('扉を開く');
  });

  it('swings the door when that item is chosen', () => {
    const terrain = makeTerrain({ isDoor: true, doorStyle: 'swing' });
    const menu = buildTerrainContextMenu(
      terrain as unknown as Terrain,
      50,
      { x: 0, y: 0, z: 0 },
      makeService(),
      makeActionService(),
      vi.fn(),
      t
    );

    menu.find((item) => item.name === '扉を開く')?.action?.();

    expect(terrain.isDoorOpen).toBe(true);
  });

  it('offers every way for a door to open, and none at all', () => {
    const menu = buildTerrainContextMenu(
      makeTerrain() as unknown as Terrain,
      50,
      { x: 0, y: 0, z: 0 },
      makeService(),
      makeActionService(),
      vi.fn(),
      t
    );
    const styles = menu.find((item) => item.name === '扉の開き方');

    // Not a door, plus every way one can open. A piece that is not a door cannot be turned round.
    expect(styles?.subActions?.length).toBe(DOOR_STYLES.length + 1);
    expect(styles?.subActions?.map((entry) => entry.name.slice(2)).sort()).toEqual(
      ['上へ上がる', '下へ沈む', '扉ではない', '開き戸', '横にスライド'].sort()
    );
  });

  it('offers to unlock what is locked and to lock what is not', () => {
    const lockedMenu = buildTerrainContextMenu(
      makeTerrain({ isLocked: true }) as unknown as Terrain,
      50,
      { x: 0, y: 0, z: 0 },
      makeService(),
      makeActionService(),
      vi.fn(),
      t
    );
    expect(names(lockedMenu)).toContain('固定解除');

    const unlockedMenu = buildTerrainContextMenu(
      makeTerrain({ isLocked: false }) as unknown as Terrain,
      50,
      { x: 0, y: 0, z: 0 },
      makeService(),
      makeActionService(),
      vi.fn(),
      t
    );
    expect(names(unlockedMenu)).toContain('固定する');
  });

  it('offers no slope and four directions, after a separator', () => {
    const menu = buildTerrainContextMenu(
      makeTerrain() as unknown as Terrain,
      50,
      { x: 0, y: 0, z: 0 },
      makeService(),
      makeActionService(),
      vi.fn(),
      t
    );
    const slope = menu.find((m) => m.name === '傾斜');
    expect(slope).toBeDefined();
    expect(slope?.subActions?.length).toBe(6);
  });

  it('slopes the terrain north', () => {
    const terrain = makeTerrain();
    const menu = buildTerrainContextMenu(
      terrain as unknown as Terrain,
      50,
      { x: 0, y: 0, z: 0 },
      makeService(),
      makeActionService(),
      vi.fn(),
      t
    );
    const slope = menu.find((m) => m.name === '傾斜');
    const top = slope?.subActions?.find((s) => s.name.includes('上（北）'));
    top?.action?.();
    expect(terrain.isSlope).toBe(true);
    expect(terrain.slopeDirection).toBe(SlopeDirection.TOP);
  });

  it('offers to hide the walls that are shown and to show the ones that are hidden', () => {
    const withWall = buildTerrainContextMenu(
      makeTerrain({ hasWall: true }) as unknown as Terrain,
      50,
      { x: 0, y: 0, z: 0 },
      makeService(),
      makeActionService(),
      vi.fn(),
      t
    );
    expect(names(withWall)).toContain('壁を非表示');

    const noWall = buildTerrainContextMenu(
      makeTerrain({ hasWall: false }) as unknown as Terrain,
      50,
      { x: 0, y: 0, z: 0 },
      makeService(),
      makeActionService(),
      vi.fn(),
      t
    );
    expect(names(noWall)).toContain('壁を表示');
  });

  it('offers to show or hide the shadow by which it casts', () => {
    const noShadow = buildTerrainContextMenu(
      makeTerrain({ isDropShadow: false }) as unknown as Terrain,
      50,
      { x: 0, y: 0, z: 0 },
      makeService(),
      makeActionService(),
      vi.fn(),
      t
    );
    expect(names(noShadow)).toContain('影を表示');

    const withShadow = buildTerrainContextMenu(
      makeTerrain({ isDropShadow: true }) as unknown as Terrain,
      50,
      { x: 0, y: 0, z: 0 },
      makeService(),
      makeActionService(),
      vi.fn(),
      t
    );
    expect(names(withShadow)).toContain('影を非表示');
  });

  it('hands the terrain to the editor', () => {
    const terrain = makeTerrain();
    const onEdit = vi.fn();
    const menu = buildTerrainContextMenu(
      terrain as unknown as Terrain,
      50,
      { x: 0, y: 0, z: 0 },
      makeService(),
      makeActionService(),
      onEdit,
      t
    );
    menu.find((m) => m.name === '地形設定を編集')!.action!();
    expect(onEdit).toHaveBeenCalledWith(terrain);
  });

  it('destroys the terrain', () => {
    const terrain = makeTerrain();
    const menu = buildTerrainContextMenu(
      terrain as unknown as Terrain,
      50,
      { x: 0, y: 0, z: 0 },
      makeService(),
      makeActionService(),
      vi.fn(),
      t
    );
    menu.find((m) => m.name === '削除する')!.action!();
    expect(terrain.destroy).toHaveBeenCalled();
  });
});
