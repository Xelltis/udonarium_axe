import { GameTable } from '@axe/domain/tabletop/game-table';

/** A wall of the table, by the face it is. */
export type WallSurface = 'north-wall' | 'east-wall' | 'south-wall' | 'west-wall';

const WALL_SURFACES: ReadonlySet<string> = new Set<WallSurface>(['north-wall', 'east-wall', 'south-wall', 'west-wall']);

/** Whether a face, by name, is one of the table's walls. */
export function isTableWall(surface: string | undefined): surface is WallSurface {
  return surface !== undefined && WALL_SURFACES.has(surface);
}

/** How a wall of the table is set up. */
export interface TableWallSetting {
  readonly surface: WallSurface;
  /** Whether it is set to be shown; it is drawn only once its picture can be read too. */
  readonly shown: boolean;
  readonly imageIdentifier: string;
  /** How far it runs along the table: the table's width for the north and south walls, its depth for the others. */
  readonly lengthPx: number;
  readonly heightPx: number;
}

/** The four walls of a table, as the table sets them up. */
export function tableWallSettings(table: GameTable): readonly TableWallSetting[] {
  const width = table.width * table.gridSize;
  const depth = table.height * table.gridSize;
  const heightPx = table.wallHeight * table.gridSize;
  return [
    {
      surface: 'north-wall',
      shown: table.showNorthWall,
      imageIdentifier: table.northWallImageIdentifier,
      lengthPx: width,
      heightPx,
    },
    {
      surface: 'east-wall',
      shown: table.showEastWall,
      imageIdentifier: table.eastWallImageIdentifier,
      lengthPx: depth,
      heightPx,
    },
    {
      surface: 'south-wall',
      shown: table.showSouthWall,
      imageIdentifier: table.southWallImageIdentifier,
      lengthPx: width,
      heightPx,
    },
    {
      surface: 'west-wall',
      shown: table.showWestWall,
      imageIdentifier: table.westWallImageIdentifier,
      lengthPx: depth,
      heightPx,
    },
  ];
}
