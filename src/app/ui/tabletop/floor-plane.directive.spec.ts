import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TABLE_SCREEN } from '@axe/application/tabletop/table-screen';
import { IMatrix3D, Matrix3D } from '@axe/core/transform/matrix-3d';
import { DEFAULT_TABLE_CAMERA_VIEW, TableLayout } from '@axe/domain/tabletop/camera/table-camera';
import { FloorPlaneDirective } from '@axe/ui/tabletop/floor-plane.directive';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

@Component({
  selector: 'test-host',
  template: `<div appFloorPlane></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FloorPlaneDirective],
})
class TestHostComponent {}

const LAYOUT: TableLayout = { left: 10, top: 20, width: 800, height: 600, boardWidth: 400, boardHeight: 200 };

describe('FloorPlaneDirective', () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => frames.push(frame));
  });

  afterEach(() => vi.restoreAllMocks());

  function laidPlane(): HTMLElement {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    TestBed.tick();
    for (const frame of frames.splice(0)) frame(0);
    return fixture.nativeElement.querySelector('[appfloorplane]') as HTMLElement;
  }

  it('lays the element, as large as the board, on the screen it is given, the board carried through its view whole', () => {
    const placed: IMatrix3D[] = [];
    TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        { provide: TableCameraService, useValue: { layout: LAYOUT, layoutVersion: signal(0) } },
        {
          provide: TABLE_SCREEN,
          useValue: {
            version: signal(0),
            screenOf: signal(null),
            screenMatrixOf: signal((matrix: IMatrix3D) => {
              placed.push(matrix);
              return 'matrix3d(0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)';
            }),
          },
        },
      ],
    });

    const plane = laidPlane();

    expect(plane.style.width).toBe('400px');
    expect(plane.style.height).toBe('200px');
    expect(plane.style.transform).toBe('matrix3d(0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)');
    expect(placed[0]).toMatchObject({ m11: 1, m22: 1, m33: 1, m41: 0, m42: 0, m43: 0 });
  });

  it('lays the board’s corners where the table’s camera draws them, by default', () => {
    TestBed.configureTestingModule({ imports: [TestHostComponent] });
    const camera = TestBed.inject(TableCameraService);
    camera.setLayout(LAYOUT);
    camera.showView(DEFAULT_TABLE_CAMERA_VIEW);

    const laid = new Matrix3D().setCSS(laidPlane().style.transform);

    const screen = camera.screenOf()!;
    for (const [x, y] of [
      [0, 0],
      [400, 0],
      [400, 200],
      [0, 200],
    ]) {
      const at = laid.project({ x, y, z: 0, w: 1 });
      expect(at.x).toBeCloseTo(screen(x, y, 0).x, 3);
      expect(at.y).toBeCloseTo(screen(x, y, 0).y, 3);
    }
  });
});
