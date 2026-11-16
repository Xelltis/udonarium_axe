import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { GameTableGridFaces } from '@axe/features/tabletop/game-table/game-table-grid-faces';
import { GridFaceCache } from '@axe/features/tabletop/game-table/grid-face-cache';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GameTableGridFaces', () => {
  let table: GameTable;
  let terrains: ReturnType<typeof signal<readonly Terrain[]>>;
  let faces: GameTableGridFaces;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    vi.spyOn(GridFaceCache.prototype, 'dataUrl').mockReturnValue('data:image/png;base64,GRID');
    table = new GameTable();
    table.initialize();
    terrains = signal<readonly Terrain[]>([]);
    faces = new GameTableGridFaces({
      objectChange: TestBed.inject(ObjectChangeService),
      images: TestBed.inject(ImageService),
      table: () => table,
      tableSelecter: () => TableSelecter.instance,
      terrains,
    });
  });

  afterEach(() => {
    table.destroy();
    vi.restoreAllMocks();
  });

  function picture(url: string): string {
    return TestBed.inject(ImageStorage).add(url).identifier;
  }

  it('hands the grid over each wall that is shown and has a picture, by the face of the scene it goes on', async () => {
    table.gridShow = true;
    table.showNorthWall = true;
    table.northWallImageIdentifier = picture('blob:north');
    table.showEastWall = true;
    table.showSouthWall = true;
    table.southWallImageIdentifier = picture('blob:south');
    await Promise.resolve();

    expect([...faces.faceGrids().keys()]).toEqual(['table:north', 'table:south']);
    expect(faces.activeWalls().map((wall) => wall.image.url)).toEqual(['blob:north', 'blob:south']);
  });

  it('hands the grid over the front of a gridded beam hung on a wall, and nothing while the grid is hidden', async () => {
    table.gridShow = true;
    const beam = Terrain.create('梁', 2, 3, 1, '', '');
    beam.location.surface = 'north-wall';
    beam.isGrid = true;
    table.appendChild(beam);
    terrains.set([beam]);
    await Promise.resolve();

    expect([...faces.faceGrids().keys()]).toEqual([`${beam.identifier}:beam-top`]);
    expect(faces.beamWallGrids()[0]).toMatchObject({ width: 2 * table.gridSize, height: 3 * table.gridSize });

    table.gridShow = false;
    await Promise.resolve();
    const none = faces.faceGrids();
    expect(none.size).toBe(0);
    table.gridShow = false;
    await Promise.resolve();
    expect(faces.faceGrids()).toBe(none);
  });
});
