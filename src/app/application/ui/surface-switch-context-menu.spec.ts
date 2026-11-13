import { TranslateFn } from '@axe/application/i18n/translate.token';
import { buildSurfaceSwitchContextMenu } from '@axe/application/ui/surface-switch-context-menu';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTable } from '@axe/domain/tabletop/game-table';

describe('buildSurfaceSwitchContextMenu', () => {
  const t: TranslateFn = (key: string) => key;

  function tableWithWalls(
    walls: Partial<Pick<GameTable, 'showNorthWall' | 'showEastWall' | 'showSouthWall' | 'showWestWall'>>
  ) {
    const table = new GameTable();
    table.width = 20;
    table.height = 10;
    table.gridSize = 50;
    table.wallHeight = 6;
    Object.assign(table, walls);
    table.initialize();
    return table;
  }

  function pieceOn(surface?: string): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: 100, y: 100, ...(surface ? { surface } : {}) };
    return character;
  }

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('offers nothing on a table that shows no wall', () => {
    expect(buildSurfaceSwitchContextMenu(pieceOn(), tableWithWalls({}), t)).toEqual([]);
  });

  it('offers the walls the table shows, and not the surface the piece is on', () => {
    const table = tableWithWalls({ showNorthWall: true, showWestWall: true });

    const [entry] = buildSurfaceSwitchContextMenu(pieceOn(), table, t);

    expect(entry.name).toBe('feature.tabletop.contextMenu.moveToSurface');
    expect(entry.subActions?.map((action) => action.name)).toEqual([
      'feature.tabletop.contextMenu.surfaceNorthWall',
      'feature.tabletop.contextMenu.surfaceWestWall',
    ]);
  });

  it('offers the floor to a piece on a wall', () => {
    const table = tableWithWalls({ showNorthWall: true });

    const [entry] = buildSurfaceSwitchContextMenu(pieceOn('north-wall'), table, t);

    expect(entry.subActions?.map((action) => action.name)).toEqual(['feature.tabletop.contextMenu.surfaceFloor']);
  });

  it('puts the piece near the middle of the surface it is sent to', () => {
    const table = tableWithWalls({ showNorthWall: true, showEastWall: true });
    const piece = pieceOn();
    const [entry] = buildSurfaceSwitchContextMenu(piece, table, t);

    entry.subActions?.find((action) => action.name.endsWith('surfaceEastWall'))?.action?.();

    expect(piece.location).toEqual({ name: 'table', x: 225, y: 125, surface: 'east-wall' });

    entry.subActions?.find((action) => action.name.endsWith('surfaceNorthWall'))?.action?.();
    expect(piece.location).toEqual({ name: 'table', x: 475, y: 125, surface: 'north-wall' });
  });

  it('sends a piece back to the floor without a surface name', () => {
    const table = tableWithWalls({ showSouthWall: true });
    const piece = pieceOn('south-wall');
    const [entry] = buildSurfaceSwitchContextMenu(piece, table, t);

    entry.subActions?.[0].action?.();

    expect(piece.location).toEqual({ name: 'table', x: 475, y: 225, surface: undefined });
  });
});
