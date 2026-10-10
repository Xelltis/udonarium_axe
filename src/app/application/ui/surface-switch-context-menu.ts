import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { surfaceOf, TABLE_SURFACES, TableSurface, TabletopObject } from '@axe/domain/tabletop/tabletop-object';

const SURFACE_LABEL_KEY: Record<TableSurface, string> = {
  floor: 'feature.tabletop.contextMenu.surfaceFloor',
  'north-wall': 'feature.tabletop.contextMenu.surfaceNorthWall',
  'east-wall': 'feature.tabletop.contextMenu.surfaceEastWall',
  'south-wall': 'feature.tabletop.contextMenu.surfaceSouthWall',
  'west-wall': 'feature.tabletop.contextMenu.surfaceWestWall',
};

function isSurfaceAvailable(table: GameTable, surface: TableSurface): boolean {
  switch (surface) {
    case 'floor':
      return true;
    case 'north-wall':
      return table.showNorthWall;
    case 'east-wall':
      return table.showEastWall;
    case 'south-wall':
      return table.showSouthWall;
    case 'west-wall':
      return table.showWestWall;
  }
}

function centerOf(table: GameTable, surface: TableSurface): { x: number; y: number } {
  const half = (n: number) => (n * table.gridSize) / 2 - 25;
  switch (surface) {
    case 'floor':
      return { x: half(table.width), y: half(table.height) };
    case 'north-wall':
    case 'south-wall':
      return { x: half(table.width), y: half(table.wallHeight) };
    case 'east-wall':
    case 'west-wall':
      return { x: half(table.height), y: half(table.wallHeight) };
  }
}

/**
 * The entry that moves a piece to another surface of a walled table: the floor or one of the walls
 * shown.
 *
 * Choosing a surface puts the piece near its centre. Empty when the table shows no other surface to
 * go to.
 */
export function buildSurfaceSwitchContextMenu(
  obj: TabletopObject,
  table: GameTable,
  t: TranslateFn
): ContextMenuAction[] {
  const currentSurface = surfaceOf(obj);
  const subActions: ContextMenuAction[] = TABLE_SURFACES.filter(
    (s) => s !== currentSurface && isSurfaceAvailable(table, s)
  ).map((s) => ({
    name: t(SURFACE_LABEL_KEY[s]),
    action: () => {
      const center = centerOf(table, s);
      obj.location = {
        name: obj.location.name,
        x: center.x,
        y: center.y,
        surface: s === 'floor' ? undefined : s,
      };
    },
  }));
  if (subActions.length === 0) return [];
  return [
    {
      name: t('feature.tabletop.contextMenu.moveToSurface'),
      subActions,
    },
  ];
}
