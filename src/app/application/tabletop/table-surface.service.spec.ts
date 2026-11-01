import { TestBed } from '@angular/core/testing';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DEFAULT_TABLE_CAMERA_VIEW } from '@axe/domain/tabletop/camera/table-camera';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { whiteBoardFrame } from '@axe/domain/tabletop/white-board-frame';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableSurfaceService', () => {
  let service: TableSurfaceService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 20;
    table.height = 15;
    table.gridSize = 50;
    table.wallHeight = 6;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    service = TestBed.inject(TableSurfaceService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function showTable(): void {
    const camera = TestBed.inject(TableCameraService);
    camera.setLayout({ left: 0, top: 0, width: 1280, height: 800, boardWidth: 1000, boardHeight: 750 });
    camera.showView({ ...DEFAULT_TABLE_CAMERA_VIEW, rotateZ: 25 });
  }

  it('frames the floor and the walls by the size of the table in view', () => {
    const dims = { widthPx: 1000, depthPx: 750, wallHeightPx: 300 };
    expect(service.frameOf('floor')).toEqual(surfaceFrame('floor', dims));
    expect(service.frameOf('east-wall')).toEqual(surfaceFrame('east-wall', dims));
  });

  it('frames a white board by its identifier, and nothing for a name it does not know', () => {
    const board = new WhiteBoard();
    board.initialize();
    board.pitch = 45;
    expect(service.frameOf(board.identifier)).toEqual(whiteBoardFrame(board, 50));
    expect(service.frameOf('no-such-face')).toBeNull();
  });

  it('brings a point of a face drawn on the page back to where it was on that face', () => {
    showTable();
    const board = new WhiteBoard();
    board.initialize();
    board.location = { name: 'table', x: 300, y: 200 };
    board.pitch = 60;
    board.rotate = 20;
    for (const face of ['floor', 'north-wall', board.identifier]) {
      const onPage = service.pageOf(face, 80, 40)!;
      const back = service.pointOn(face, onPage.x, onPage.y)!;
      expect(back.localX).toBeCloseTo(80, 6);
      expect(back.localY).toBeCloseTo(40, 6);
    }
  });

  it('has nothing to say before the table has a camera', () => {
    expect(service.pointOn('floor', 100, 100)).toBeNull();
    expect(service.pageOf('floor', 10, 10)).toBeNull();
  });

  it('sizes the floor, a wall and a board, and nothing it does not know', () => {
    const board = new WhiteBoard();
    board.initialize();
    board.width = 4;
    board.height = 3;
    expect(service.sizeOf('floor')).toEqual({ width: 1000, height: 750 });
    expect(service.sizeOf('north-wall')).toEqual({ width: 1000, height: 300 });
    expect(service.sizeOf('west-wall')).toEqual({ width: 750, height: 300 });
    expect(service.sizeOf(board.identifier)).toEqual({ width: 200, height: 150 });
    expect(service.sizeOf('no-such-face')).toBeNull();
  });

  it('stands a point of a face, lifted off it, where its frame puts it, and draws it smaller further off', () => {
    const north = service.boardPointOf('north-wall', 120, 60, 25)!;
    expect(north).toEqual({ x: 120, y: 25, z: 240 });
    expect(service.drawnScaleOn('floor', 500, 375)).toBeNull();

    showTable();
    expect(service.drawnScaleOn('north-wall', 500, 0)!).toBeLessThan(service.drawnScaleOn('floor', 500, 740)!);
    expect(service.boardPointOf('no-such-face', 0, 0)).toBeNull();
  });

  it('lets a piece hang over the edge of a board, and of no face of the table', () => {
    expect(service.overhangs('a-board')).toBe(true);
    for (const face of ['floor', 'north-wall', 'east-wall', 'south-wall', 'west-wall']) {
      expect(service.overhangs(face)).toBe(false);
    }
  });
});
