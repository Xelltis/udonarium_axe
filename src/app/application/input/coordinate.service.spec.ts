import { TestBed } from '@angular/core/testing';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import {
  DEFAULT_TABLE_CAMERA_VIEW,
  pageOfTablePoint,
  tableSceneMatrix,
} from '@axe/domain/tabletop/camera/table-camera';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CoordinateService', () => {
  let service: CoordinateService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(CoordinateService);
  });

  describe('points on the table’s floor', () => {
    const layout = { left: 8, top: 40, width: 1280, height: 760, boardWidth: 1000, boardHeight: 750 };
    const view = { ...DEFAULT_TABLE_CAMERA_VIEW, rotateZ: 30, positionZ: -500 };

    function tableDrawn(): void {
      const camera = TestBed.inject(TableCameraService);
      camera.setLayout(layout);
      camera.showView(view);
    }

    it('are carried onto the page through the camera', () => {
      tableDrawn();
      const expected = pageOfTablePoint(tableSceneMatrix(view, layout), 300, 200, 0);

      const onPage = service.pageOfFloorPoint(300, 200);

      expect(onPage.x).toBeCloseTo(expected.x, 9);
      expect(onPage.y).toBeCloseTo(expected.y, 9);
    });

    it('come back from the page to where they were on the board', () => {
      tableDrawn();
      const onPage = service.pageOfFloorPoint(640, 120);

      const back = service.floorPointOf(onPage.x, onPage.y);

      expect(back.x).toBeCloseTo(640, 6);
      expect(back.y).toBeCloseTo(120, 6);
    });

    it('are the points of the page themselves before the table has a camera', () => {
      expect(service.floorPointOf(30, 40)).toEqual({ x: 30, y: 40, z: 0 });
      expect(service.pageOfFloorPoint(30, 40, 5)).toEqual({ x: 30, y: 40, z: 5 });
    });

    it('are the points of the page again once the table has gone', () => {
      tableDrawn();

      TestBed.inject(TableCameraService).forget();

      expect(service.floorPointOf(30, 40)).toEqual({ x: 30, y: 40, z: 0 });
    });
  });

  describe('points on a face named as a location names it', () => {
    it('are worked out from the face’s frame once the table has a camera', () => {
      const camera = TestBed.inject(TableCameraService);
      camera.setLayout({ left: 0, top: 0, width: 1280, height: 800, boardWidth: 1000, boardHeight: 750 });
      camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
      const surfaces = TestBed.inject(TableSurfaceService);
      vi.spyOn(surfaces, 'frameOf').mockReturnValue({
        origin: { x: 0, y: 0, z: 300 },
        u: { x: 1, y: 0, z: 0 },
        v: { x: 0, y: 0, z: -1 },
        normal: { x: 0, y: 1, z: 0 },
      });

      const onPage = service.convertFromFace({ x: 120, y: 60, z: 0 }, 'north-wall');
      const back = service.convertToFace(onPage, 'north-wall');

      expect(onPage).toMatchObject(surfaces.pageOf('north-wall', 120, 60)!);
      expect(back.x).toBeCloseTo(120, 6);
      expect(back.y).toBeCloseTo(60, 6);
    });

    it('are the points of the page themselves before then', () => {
      expect(service.convertToFace({ x: 10, y: 20, z: 0 }, 'east-wall')).toEqual({ x: 10, y: 20, z: 0 });
      expect(service.convertFromFace({ x: 10, y: 20, z: 3 }, 'floor')).toEqual({ x: 10, y: 20, z: 3 });
      expect(service.drawnScaleOnFace({ x: 10, y: 20, z: 0 }, 'floor')).toBeNull();
    });
  });
});
