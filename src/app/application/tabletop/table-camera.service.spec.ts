import { TestBed } from '@angular/core/testing';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { Matrix3D } from '@axe/core/transform/matrix-3d';
import { DEFAULT_TABLE_CAMERA_VIEW, TableLayout, tableSceneMatrix } from '@axe/domain/tabletop/camera/table-camera';

const layout: TableLayout = { left: 0, top: 30, width: 1280, height: 770, boardWidth: 1000, boardHeight: 750 };

describe('TableCameraService', () => {
  let camera: TableCameraService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    camera = TestBed.inject(TableCameraService);
  });

  it('has no matrix until the table has both drawn a view and been laid out', () => {
    expect(camera.sceneMatrix()).toBeNull();
    camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
    expect(camera.sceneMatrix()).toBeNull();
    camera.setLayout(layout);
    expect(camera.sceneMatrix()).not.toBeNull();
  });

  it('works the matrix out for the view and the layout it was last given', () => {
    camera.setLayout(layout);
    camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
    const turned = { ...DEFAULT_TABLE_CAMERA_VIEW, rotateZ: 75 };
    camera.showView(turned);

    const expected = tableSceneMatrix(turned, layout);
    const scene = camera.sceneMatrix()!;
    expect([scene.m11, scene.m12, scene.m41, scene.m42, scene.m34]).toEqual([
      expected.m11,
      expected.m12,
      expected.m41,
      expected.m42,
      expected.m34,
    ]);
    const product = Matrix3D.multiply(scene, camera.inverseSceneMatrix()!);
    expect(product.m11).toBeCloseTo(1, 9);
    expect(product.m41).toBeCloseTo(0, 6);
  });

  it('counts a change of view or of layout, and not a layout given again unchanged', () => {
    const start = camera.version();
    camera.setLayout(layout);
    camera.setLayout({ ...layout });
    expect(camera.version()).toBe(start + 1);
    camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
    expect(camera.version()).toBe(start + 2);
    camera.setLayout({ ...layout, height: 400 });
    expect(camera.version()).toBe(start + 3);
  });
});
