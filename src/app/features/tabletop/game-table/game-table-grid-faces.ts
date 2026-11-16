import { computed, Signal } from '@angular/core';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageFile, imageFileEqual } from '@axe/core/storage/image-file';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { SurfaceDims } from '@axe/domain/tabletop/surface-space';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableSurface } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { beamWallFaceGrid } from '@axe/features/tabletop/game-table/beam-top-grid';
import { WALL_SIDES, WallSurface } from '@axe/features/tabletop/game-table/game-table-walls';
import { GridFaceCache } from '@axe/features/tabletop/game-table/grid-face-cache';

/** A wall of the table that is shown and has a picture, with the grid laid over it. */
export interface ActiveWall {
  surface: TableSurface;
  image: ImageFile;
  /** The picture of the table's grid laid over the wall, or empty where the grid is not shown. */
  gridUrl: string;
}

/** The grid laid over the front of a beam standing out from a wall, where that front is on the page. */
export interface BeamWallGrid {
  identifier: string;
  matrix3d: string;
  width: number;
  height: number;
  dataUrl: string;
}

const NO_BEAM_WALL_GRIDS: readonly BeamWallGrid[] = [];
const NO_FACE_GRIDS: ReadonlyMap<string, string> = new Map();

/** What the grids on the faces of the table are worked out from. */
export interface GridFaceSources {
  readonly objectChange: ObjectChangeService;
  readonly images: ImageService;
  /** The table in use, whose walls and grid the faces are drawn from. */
  readonly table: () => GameTable;
  /** The room's table selector, whose change says another table is in use. */
  readonly tableSelecter: () => TableSelecter;
  /** The blocks on the table, of which those hung on a wall carry the grid on their front. */
  readonly terrains: Signal<readonly Terrain[]>;
}

/**
 * The pictures of the table's grid laid over the faces of its scene: over each wall that is shown
 * and has a picture, and over the front of each gridded beam hung on a wall. Each picture is drawn
 * once for its geometry and kept, and the whole is handed to the canvas by the face it goes on.
 */
export class GameTableGridFaces {
  private readonly cache = new GridFaceCache();

  constructor(private readonly from: GridFaceSources) {}

  readonly northWallImage = this.wallImageFor((table) => table.northWallImageIdentifier);
  readonly eastWallImage = this.wallImageFor((table) => table.eastWallImageIdentifier);
  readonly southWallImage = this.wallImageFor((table) => table.southWallImageIdentifier);
  readonly westWallImage = this.wallImageFor((table) => table.westWallImageIdentifier);

  private readonly wallImages: Record<WallSurface, Signal<ImageFile>> = {
    'north-wall': this.northWallImage,
    'south-wall': this.southWallImage,
    'west-wall': this.westWallImage,
    'east-wall': this.eastWallImage,
  };

  /** How the table's walls stand: how big, which are shown, and whether the grid is laid over them. */
  readonly wallState = computed(() => {
    const table = this.watchTable();
    return {
      heightPx: table.wallHeight * table.gridSize,
      widthPx: table.width * table.gridSize,
      depthPx: table.height * table.gridSize,
      showNorth: table.showNorthWall,
      showEast: table.showEastWall,
      showSouth: table.showSouthWall,
      showWest: table.showWestWall,
      gridShow: table.gridShow,
    };
  });

  /** The walls that are shown and have a picture, each with the grid laid over it where the grid is shown. */
  readonly activeWalls = computed<readonly ActiveWall[]>(() => {
    const state = this.wallState();
    const table = this.watchTable();
    const walls: ActiveWall[] = [];
    for (const side of WALL_SIDES) {
      const image = this.wallImages[side.surface]();
      if (!side.shown(table) || !image.url) continue;
      const widthPx = side.along === 'width' ? state.widthPx : state.depthPx;
      const gridUrl = state.gridShow
        ? this.cache.dataUrl(table, widthPx, state.heightPx, 0, 0, side.labelPrefix, side.labelMatrix)
        : '';
      walls.push({ surface: side.surface, image, gridUrl });
    }
    return walls;
  });

  /** The grid over the front of each gridded beam hung on a wall, while the table shows its grid. */
  readonly beamWallGrids = computed<readonly BeamWallGrid[]>(() => {
    const table = this.watchTable();
    if (!table.gridShow) return NO_BEAM_WALL_GRIDS;
    const grid = table.gridSize;
    const dims: SurfaceDims = {
      widthPx: table.width * grid,
      depthPx: table.height * grid,
      wallHeightPx: table.wallHeight * grid,
    };
    const result: BeamWallGrid[] = [];
    for (const terrain of this.from.terrains()) {
      this.from.objectChange.versionOf(terrain.identifier)();
      const face = beamWallFaceGrid(terrain, dims, grid);
      if (!face) continue;
      result.push({
        identifier: terrain.identifier,
        matrix3d: face.matrix3d,
        width: face.width,
        height: face.height,
        dataUrl: this.cache.dataUrl(table, face.width, face.height, face.offsetTop, face.offsetLeft, face.prefix, null),
      });
    }
    return result.length > 0 ? result : NO_BEAM_WALL_GRIDS;
  });

  /**
   * The pictures of the grid by the face of the scene each goes on: `table:north` and the other
   * walls, and `<block>:beam-top` for the front of a beam. The same empty map while there are none.
   */
  readonly faceGrids = computed<ReadonlyMap<string, string>>(() => {
    const grids = new Map<string, string>();
    for (const wall of this.activeWalls()) {
      if (wall.gridUrl) grids.set(`table:${wall.surface.replace(/-wall$/, '')}`, wall.gridUrl);
    }
    for (const beam of this.beamWallGrids()) grids.set(`${beam.identifier}:beam-top`, beam.dataUrl);
    return grids.size > 0 ? grids : NO_FACE_GRIDS;
  });

  private wallImageFor(identifierOf: (table: GameTable) => string): Signal<ImageFile> {
    return computed(
      () => {
        this.from.objectChange.fileVersion();
        return this.from.images.getEmptyOr(identifierOf(this.watchTable()));
      },
      { equal: imageFileEqual() }
    );
  }

  /** The table in use, read so that a change to it or to which table is in use is followed. */
  private watchTable(): GameTable {
    const table = this.from.table();
    this.from.objectChange.versionOf(table.identifier)();
    this.from.objectChange.versionOf(this.from.tableSelecter().identifier)();
    return table;
  }
}
