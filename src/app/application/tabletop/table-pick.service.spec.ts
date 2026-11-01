import { TestBed } from '@angular/core/testing';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { ImageService } from '@axe/application/storage/image.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { DEFAULT_TABLE_CAMERA_VIEW, pageOfTablePoint, TableLayout } from '@axe/domain/tabletop/camera/table-camera';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TerrainFogCover } from '@axe/domain/tabletop/terrain-cover';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GRID = 50;
const layout: TableLayout = { left: 0, top: 0, width: 1280, height: 800, boardWidth: 1000, boardHeight: 1000 };

describe('TablePickService', () => {
  let service: TablePickService;
  let camera: TableCameraService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    camera = TestBed.inject(TableCameraService);
    camera.setLayout(layout);
    camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
    service = TestBed.inject(TablePickService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function blockAt(col: number, row: number, height = 2): Terrain {
    const terrain = Terrain.create('block', 1, 1, height, '', '');
    terrain.location = { name: 'table', x: col * GRID, y: row * GRID };
    table.appendChild(terrain);
    return terrain;
  }

  /** Where the middle of a cell's top is drawn on the page. */
  function onPage(col: number, row: number, z: number): { x: number; y: number } {
    return pageOfTablePoint(camera.sceneMatrix()!, (col + 0.5) * GRID, (row + 0.5) * GRID, z);
  }

  async function settled(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('lands on the block drawn at a point of the page, and on nothing beside it', async () => {
    const block = blockAt(5, 5);
    await settled();
    const top = onPage(5, 5, 2 * GRID);
    expect(service.pickAt(top.x, top.y)?.target.id).toBe(block.identifier);
    const bare = onPage(12, 12, 0);
    expect(service.pickAt(bare.x, bare.y)).toBeNull();
  });

  it('puts the nearer of two blocks on one line of sight first', async () => {
    const near = blockAt(5, 6, 6);
    const far = blockAt(5, 5, 1);
    await settled();
    // The camera looks from the south, so a tall block just south of a low one hides it.
    const hidden = onPage(5, 5, GRID);
    expect(service.allAt(hidden.x, hidden.y).map((hit) => hit.target.id)).toEqual([near.identifier, far.identifier]);
  });

  it('builds a block over again once it has moved', async () => {
    const block = blockAt(5, 5);
    await settled();
    const first = service.targets()[0];
    expect(service.targets()[0]).toBe(first);

    block.location = { name: 'table', x: 8 * GRID, y: 5 * GRID };
    await settled();
    expect(service.targets()[0]).not.toBe(first);
    const top = onPage(8, 5, 2 * GRID);
    expect(service.pickAt(top.x, top.y)?.target.id).toBe(block.identifier);
  });

  it('leaves out a block the fog lies over entirely', async () => {
    const block = blockAt(5, 5);
    await settled();
    const cover: TerrainFogCover = { cols: 1, rows: 1, cleared: [false] } as unknown as TerrainFogCover;
    vi.spyOn(TestBed.inject(VisionService), 'terrainFogCover').mockReturnValue(cover);
    const top = onPage(5, 5, 2 * GRID);
    expect(service.pickAt(top.x, top.y)).toBeNull();
    expect(block.identifier).toBeTruthy();
  });

  it('has nothing to say before the table has a camera', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    expect(TestBed.inject(TablePickService).pickAt(100, 100)).toBeNull();
    expect(TestBed.inject(TablePickService).faceAt(100, 100)).toBeNull();
  });

  function boardAt(x: number, y: number, pitch = 0, rotate = 0): WhiteBoard {
    const board = new WhiteBoard();
    board.initialize();
    board.width = 8;
    board.height = 4;
    board.location = { name: 'table', x, y };
    board.pitch = pitch;
    board.rotate = rotate;
    table.appendChild(board);
    return board;
  }

  describe('where a point lands', () => {
    it('is on top of the block the line of sight meets, and on the floor beside it', async () => {
      blockAt(5, 5);
      await settled();
      const top = onPage(5, 5, 2 * GRID);
      const onTop = service.landingAt(top.x, top.y);
      expect(onTop.x).toBeCloseTo(5.5 * GRID, 6);
      expect(onTop.y).toBeCloseTo(5.5 * GRID, 6);
      expect(onTop.z).toBeCloseTo(2 * GRID, 6);

      const bare = onPage(12, 12, 0);
      expect(service.landingAt(bare.x, bare.y)).toMatchObject({ z: 0 });
      expect(service.landingAt(bare.x, bare.y).x).toBeCloseTo(12.5 * GRID, 6);
    });

    it('is on the floor’s plane beyond the edge of the table', () => {
      const beyond = pageOfTablePoint(camera.sceneMatrix()!, -300, 400, 0);
      const landed = service.landingAt(beyond.x, beyond.y);
      expect(landed.x).toBeCloseTo(-300, 6);
      expect(landed.y).toBeCloseTo(400, 6);
      expect(landed.z).toBe(0);
    });

    it('is on a board stood up where the board draws the point', async () => {
      const board = boardAt(300, 200, 90);
      await settled();
      const surfaces = TestBed.inject(TableSurfaceService);
      // Well up the board, clear of its foot on the floor.
      const onPage = surfaces.pageOf(board.identifier, 100, 50)!;
      const landed = service.landingAt(onPage.x, onPage.y);
      const expected = surfaces.boardPointOf(board.identifier, 100, 50)!;
      expect(expected.z).toBeGreaterThan(50);
      expect(landed.x).toBeCloseTo(expected.x, 6);
      expect(landed.y).toBeCloseTo(expected.y, 6);
      expect(landed.z).toBeCloseTo(expected.z, 6);
    });

    it('is read off the element at the point before the table has a camera', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
      const read = vi
        .spyOn(TestBed.inject(CoordinateService), 'calcTabletopLocalCoordinate')
        .mockReturnValue({ x: 1, y: 2, z: 3 });
      expect(TestBed.inject(TablePickService).landingAt(40, 50)).toEqual({ x: 1, y: 2, z: 3 });
      expect(read.mock.calls[0][0]).toEqual({ x: 40, y: 50, z: 0 });
    });
  });

  describe('the face a point lands on', () => {
    it('is the floor where nothing else is', async () => {
      await settled();
      const bare = onPage(12, 12, 0);
      expect(service.faceAt(bare.x, bare.y)).toBe('floor');
    });

    it('is a board lying on the floor, over the floor it lies on', async () => {
      const board = boardAt(100, 100);
      await settled();
      const over = onPage(4, 3, 0);
      expect(service.faceAt(over.x, over.y)).toBe(board.identifier);
    });

    it('is a wall only once the wall is drawn with a picture', async () => {
      table.showNorthWall = true;
      table.northWallImageIdentifier = 'north-picture';
      await settled();
      const onWall = TestBed.inject(TableSurfaceService).pageOf('north-wall', 500, 20)!;
      expect(service.faceAt(onWall.x, onWall.y)).not.toBe('north-wall');

      const picture = { isEmpty: false, url: 'blob:north-picture' } as unknown as ImageFile;
      vi.spyOn(TestBed.inject(ImageService), 'getEmptyOr').mockReturnValue(picture);
      expect(service.faceAt(onWall.x, onWall.y)).toBe('north-wall');
    });

    it('is the face what stands in the way stands on, once the line of sight stops at it', async () => {
      // A block on the floor stands over a board lying there: past the block the line of sight
      // reaches the board.
      boardAt(0, 0).height = 8;
      blockAt(4, 3, 2);
      await settled();
      const top = onPage(4, 3, 2 * GRID);
      expect(service.faceAt(top.x, top.y, { stopsAt: () => true })).toBe('floor');
      expect(service.faceAt(top.x, top.y)).not.toBe('floor');
    });

    it('passes through a face it is told to, and whatever stands on that face', async () => {
      const board = boardAt(100, 100);
      const onBoard = Terrain.create('on the board', 1, 1, 2, '', '');
      onBoard.location = { name: 'table', x: 100, y: 50, surface: board.identifier };
      table.appendChild(onBoard);
      await settled();
      const top = onPage(4, 3, 2 * GRID);
      const options = { excluding: new Set([board.identifier]), stopsAt: () => true };
      expect(service.faceAt(top.x, top.y, options)).toBe('floor');
    });
  });

  it('lands on a block stuck to a board where the board draws it, however the board is turned', async () => {
    const board = boardAt(300, 200, 60, 20);
    const onBoard = Terrain.create('on the board', 1, 1, 1, '', '');
    onBoard.location = { name: 'table', x: 50, y: 50, surface: board.identifier };
    table.appendChild(onBoard);
    await settled();
    const surfaces = TestBed.inject(TableSurfaceService);

    const front = surfaces.pageOf(board.identifier, 75, 75, GRID)!;
    expect(service.pickAt(front.x, front.y)?.target).toMatchObject({
      id: onBoard.identifier,
      surface: board.identifier,
    });
    const beside = surfaces.pageOf(board.identifier, 300, 75)!;
    expect(service.pickAt(beside.x, beside.y)).toBeNull();
  });

  it('lands on a block put on a wall where it runs out from the wall', async () => {
    const beam = Terrain.create('beam', 4, 1, 1, '', '');
    beam.location = { name: 'table', x: 100, y: 100, surface: 'north-wall' };
    table.appendChild(beam);
    await settled();

    const front = TestBed.inject(TableSurfaceService).pageOf('north-wall', 150, 125, GRID)!;
    expect(service.pickAt(front.x, front.y)?.target).toMatchObject({ id: beam.identifier, surface: 'north-wall' });
  });

  it('lands on a die where its frame lies, and lets the blocks a piece lands on be picked apart from it', async () => {
    const die = DiceSymbol.create('D6', DiceType.D6, 1);
    die.location = { name: 'table', x: 5 * GRID, y: 5 * GRID };
    await settled();

    const frame = onPage(5, 5, 1);
    expect(service.pickAt(frame.x, frame.y)?.target).toMatchObject({ id: die.identifier, layer: 'dice-symbol' });
    expect(service.targets()).toEqual([]);
    expect(service.landingAt(frame.x, frame.y).z).toBe(0);
  });
});
