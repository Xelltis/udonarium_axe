import { GameTable } from '@axe/domain/tabletop/game-table';

export type WallSurface = 'north-wall' | 'south-wall' | 'west-wall' | 'east-wall';

export interface WallSide {
  readonly surface: WallSurface;
  readonly labelPrefix: string;
  readonly labelMatrix: readonly [number, number, number, number] | null;
  readonly along: 'width' | 'depth';
  readonly mirrored: boolean;
  shown(table: GameTable): boolean;
  imageIdentifier(table: GameTable): string;
}

export const WALL_SIDES: readonly WallSide[] = [
  {
    surface: 'north-wall',
    labelPrefix: 'N',
    labelMatrix: null,
    along: 'width',
    mirrored: false,
    shown: (table) => table.showNorthWall,
    imageIdentifier: (table) => table.northWallImageIdentifier,
  },
  {
    surface: 'south-wall',
    labelPrefix: 'S',
    labelMatrix: [-1, 0, 0, 1],
    along: 'width',
    mirrored: true,
    shown: (table) => table.showSouthWall,
    imageIdentifier: (table) => table.southWallImageIdentifier,
  },
  {
    surface: 'west-wall',
    labelPrefix: 'W',
    labelMatrix: null,
    along: 'depth',
    mirrored: true,
    shown: (table) => table.showWestWall,
    imageIdentifier: (table) => table.westWallImageIdentifier,
  },
  {
    surface: 'east-wall',
    labelPrefix: 'E',
    labelMatrix: null,
    along: 'depth',
    mirrored: false,
    shown: (table) => table.showEastWall,
    imageIdentifier: (table) => table.eastWallImageIdentifier,
  },
];
