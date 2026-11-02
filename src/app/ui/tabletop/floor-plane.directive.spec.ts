import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { FloorPlaneDirective } from '@axe/ui/tabletop/floor-plane.directive';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

@Component({
  selector: 'test-host',
  template: `<div appFloorPlane></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FloorPlaneDirective],
})
class TestHostComponent {}

describe('FloorPlaneDirective', () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => frames.push(frame));
    TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        {
          provide: TableCameraService,
          useValue: {
            version: signal(0),
            layout: { left: 10, top: 20, width: 800, height: 600, boardWidth: 400, boardHeight: 200 },
          },
        },
        {
          provide: TableSurfaceService,
          useValue: { pageOf: (_surface: string, x: number, y: number) => ({ x: 10 + x / 2, y: 20 + y / 2 }) },
        },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('lays the element, as large as the board, where the floor is drawn within the screen over the table', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
    TestBed.tick();
    for (const frame of frames.splice(0)) frame(0);
    const plane = fixture.nativeElement.querySelector('[appfloorplane]') as HTMLElement;

    expect(plane.style.width).toBe('400px');
    expect(plane.style.height).toBe('200px');
    expect(plane.style.transform).toBe('matrix3d(0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)');
  });
});
