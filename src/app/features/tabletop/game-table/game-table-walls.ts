import { GameTable } from '@axe/domain/tabletop/game-table';

export type WallSurface = 'north-wall' | 'south-wall' | 'west-wall' | 'east-wall';

export interface WallSide {
  readonly surface: WallSurface;
  readonly labelPrefix: string;
  readonly labelMatrix: readonly [number, number, number, number] | null;
  readonly along: 'width' | 'depth';
  shown(table: GameTable): boolean;
}

export const WALL_SIDES: readonly WallSide[] = [
  {
    surface: 'north-wall',
    labelPrefix: 'N',
    labelMatrix: null,
    along: 'width',
    shown: (table) => table.showNorthWall,
  },
  {
    surface: 'south-wall',
    labelPrefix: 'S',
    labelMatrix: [-1, 0, 0, 1],
    along: 'width',
    shown: (table) => table.showSouthWall,
  },
  {
    surface: 'west-wall',
    labelPrefix: 'W',
    labelMatrix: null,
    along: 'depth',
    shown: (table) => table.showWestWall,
  },
  {
    surface: 'east-wall',
    labelPrefix: 'E',
    labelMatrix: null,
    along: 'depth',
    shown: (table) => table.showEastWall,
  },
];
