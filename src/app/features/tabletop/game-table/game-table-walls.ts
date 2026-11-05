import { GameTable } from '@axe/domain/tabletop/game-table';

export type WallSurface = 'north-wall' | 'south-wall' | 'west-wall' | 'east-wall';

export interface WallSide {
  readonly surface: WallSurface;
  readonly containerClass: string;
  readonly containerTransform: string;
  readonly containerOrigin: string;
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
    containerClass: 'top-0 left-0',
    containerTransform: 'translateY(-100%) rotateX(90deg) rotateZ(180deg) scaleX(-1)',
    containerOrigin: '50% 100%',
    labelPrefix: 'N',
    labelMatrix: null,
    along: 'width',
    mirrored: false,
    shown: (table) => table.showNorthWall,
    imageIdentifier: (table) => table.northWallImageIdentifier,
  },
  {
    surface: 'south-wall',
    containerClass: 'bottom-0 left-0',
    containerTransform: 'rotateX(-90deg) scaleX(-1)',
    containerOrigin: '50% 100%',
    labelPrefix: 'S',
    labelMatrix: [-1, 0, 0, 1],
    along: 'width',
    mirrored: true,
    shown: (table) => table.showSouthWall,
    imageIdentifier: (table) => table.southWallImageIdentifier,
  },
  {
    surface: 'west-wall',
    containerClass: 'top-0 left-0',
    containerTransform: 'rotateZ(90deg) rotateX(-90deg) scaleX(-1) translateX(-100%) translateY(-100%)',
    containerOrigin: '0% 0%',
    labelPrefix: 'W',
    labelMatrix: null,
    along: 'depth',
    mirrored: true,
    shown: (table) => table.showWestWall,
    imageIdentifier: (table) => table.westWallImageIdentifier,
  },
  {
    surface: 'east-wall',
    containerClass: 'top-0 right-0',
    containerTransform: 'rotateZ(-90deg) rotateX(-90deg) translateY(-100%) translateX(-100%) scaleX(-1)',
    containerOrigin: '100% 0%',
    labelPrefix: 'E',
    labelMatrix: null,
    along: 'depth',
    mirrored: false,
    shown: (table) => table.showEastWall,
    imageIdentifier: (table) => table.eastWallImageIdentifier,
  },
];

export interface WallBackground {
  surfaceBackground: string;
  surfaceBackgroundSize: string;
  surfaceBackgroundRepeat: string;
}

/**
 * The CSS background for a wall: its picture stretched over the whole wall, with the grid picture
 * laid over it when there is one.
 */
export function wallBackground(imageUrl: string, gridUrl: string): WallBackground {
  if (!gridUrl) {
    return {
      surfaceBackground: `url(${imageUrl})`,
      surfaceBackgroundSize: '100% 100%',
      surfaceBackgroundRepeat: 'no-repeat',
    };
  }
  return {
    surfaceBackground: `url(${gridUrl}), url(${imageUrl})`,
    surfaceBackgroundSize: '100% 100%, 100% 100%',
    surfaceBackgroundRepeat: 'no-repeat, no-repeat',
  };
}
