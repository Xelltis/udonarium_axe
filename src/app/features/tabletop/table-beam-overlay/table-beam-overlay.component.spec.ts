import { TestBed } from '@angular/core/testing';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { Matrix3D } from '@axe/core/transform/matrix-3d';
import { DEFAULT_TABLE_CAMERA_VIEW, TableLayout } from '@axe/domain/tabletop/camera/table-camera';
import { LightBeam, LightGlow } from '@axe/domain/tabletop/vision-scene';
import { TableBeamOverlayComponent } from '@axe/features/tabletop/table-beam-overlay/table-beam-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const layout: TableLayout = { left: 0, top: 30, width: 1280, height: 770, boardWidth: 1000, boardHeight: 1000 };

const beam: LightBeam = {
  width: 120,
  height: 200,
  clip: 'polygon(50% 0%, 0% 100%, 100% 100%)',
  color: '#ffcc66',
  fins: ['matrix3d(1,0,0,0,0,0,-1,0,0,1,0,0,240,300,150,1)', 'matrix3d(0,1,0,0,0,0,-1,0,-1,0,0,0,300,240,150,1)'],
  origin: { x: 300, y: 300, z: 150 },
};

const floorGlow: LightGlow = { x: 500, y: 400, z: 60, size: 40, color: '#ffeeaa', transform: null };

const wallGlow: LightGlow = {
  x: 0,
  y: 300,
  z: 80,
  size: 40,
  color: '#ffeeaa',
  transform: 'matrix3d(0,1,0,0,0,0,-1,0,1,0,0,0,0,280,100,1)',
};

describe('TableBeamOverlayComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TableBeamOverlayComponent], providers: [...TEST_PROVIDERS] });
    const vision = TestBed.inject(VisionService);
    vi.spyOn(vision, 'lightBeams').mockReturnValue([beam]);
    vi.spyOn(vision, 'lightGlows').mockReturnValue([floorGlow, wallGlow]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function overlay(overCanvas: boolean, withCamera = true): HTMLElement {
    if (withCamera) {
      const camera = TestBed.inject(TableCameraService);
      camera.setLayout(layout);
      camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
    }
    const fixture = TestBed.createComponent(TableBeamOverlayComponent);
    fixture.componentRef.setInput('overCanvas', overCanvas);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('places the fins of a beam and the glows on the board among the page’s own pieces', () => {
    const [first, second, floor, wall] = Array.from(overlay(false).querySelectorAll<HTMLElement>('div'));

    expect(first.style.transform).toBe(beam.fins[0]);
    expect(second.style.transform).toBe(beam.fins[1]);
    expect(floor.style.transform).toContain('translate3d(500px, 400px, 60px)');
    expect(wall.style.transform).toBe(wallGlow.transform);
  });

  it('lays the fins of a beam on the screen over a canvas, carried through the camera from where they hang', () => {
    const laid = TestBed.inject(TableCameraService);
    const [first, second] = Array.from(overlay(true).querySelectorAll<HTMLElement>('div'));

    const onScreen = laid.screenMatrixOf()!;
    expect(first.style.transform).toBe(onScreen(new Matrix3D().setCSS(beam.fins[0])));
    expect(second.style.transform).toBe(onScreen(new Matrix3D().setCSS(beam.fins[1])));
    expect(first.style.clipPath).toBe(beam.clip);
  });

  it('stands a glow facing the screen over a canvas where the canvas draws its light, and lays one on a wall flat against it', () => {
    const camera = TestBed.inject(TableCameraService);
    const [, , floor, wall] = Array.from(overlay(true).querySelectorAll<HTMLElement>('div'));

    const at = camera.screenOf()!(floorGlow.x, floorGlow.y, floorGlow.z);
    expect(floor.style.transform).toBe(`translate(${at.x}px, ${at.y}px) scale(${at.scale}) translate(-50%, -50%)`);
    expect(wall.style.transform).toBe(camera.screenMatrixOf()!(new Matrix3D().setCSS(wallGlow.transform!)));
  });

  it('lays nothing over a canvas before the camera is set', () => {
    expect(overlay(true, false).querySelectorAll('div')).toHaveLength(0);
  });
});
