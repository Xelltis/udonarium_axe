import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Table3dService } from '@axe/application/tabletop/table-3d.service';
import { TableVeilService } from '@axe/application/tabletop/table-veil.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { PERF_HEX_SURFACE_CELLS, perfCounters } from '@axe/core/util/perf-counters';
import { GridType } from '@axe/domain/tabletop/game-table';
import type { OverlayVision, SceneViewer, VisionScene } from '@axe/domain/tabletop/vision-scene';
import { TableVisionOverlayComponent } from '@axe/features/tabletop/table-vision-overlay/table-vision-overlay.component';
import { BorrowedGlobals } from '@axe/testing/borrowed-globals';
import { contextThatTakesAnything } from '@axe/testing/fake-canvas-context';
import { drawTableOnPage } from '@axe/testing/table-on-page';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => drawTableOnPage());

function hexScene(partial: Partial<VisionScene> = {}): VisionScene {
  return {
    darknessEnabled: true,
    fogEnabled: false,
    darknessLevel: 0.9,
    ambientColor: '#05060a',
    globalIllumination: 0,
    gridSize: 50,
    gridType: GridType.HEX_VERTICAL,
    widthPx: 500,
    heightPx: 400,
    lights: [],
    visionSources: [],
    sightSegments: [],
    lightSegments: [],
    shadowCasters: [],
    ...partial,
  };
}

describe('TableVisionOverlayComponent on a hex table', () => {
  let fixture: ComponentFixture<TableVisionOverlayComponent>;
  let borrowed: BorrowedGlobals;
  const scene = signal<VisionScene | null>(null);
  const viewer = signal<SceneViewer>({ userId: 'gm', isGameMaster: true });
  const overlayVision = signal<OverlayVision | null>(null);

  beforeEach(async () => {
    borrowed = new BorrowedGlobals();
    borrowed.lendOn(HTMLCanvasElement.prototype, 'getContext', () => contextThatTakesAnything());
    scene.set(null);
    TestBed.configureTestingModule({
      imports: [TableVisionOverlayComponent],
      providers: [...TEST_PROVIDERS, { provide: VisionService, useValue: { scene, viewer, overlayVision } }],
    });
    fixture = TestBed.createComponent(TableVisionOverlayComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    perfCounters.enabled = true;
    perfCounters.clear();
  });

  afterEach(() => {
    perfCounters.enabled = false;
    perfCounters.clear();
    fixture.destroy();
    borrowed.giveBack();
  });

  async function show(next: VisionScene): Promise<void> {
    scene.set(next);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('builds the board surface once while the scene is rebuilt on the same board', async () => {
    await show(hexScene());
    await show(hexScene({ darknessLevel: 0.5 }));
    await show(hexScene({ darknessLevel: 0.7 }));

    expect(perfCounters.drain().get(PERF_HEX_SURFACE_CELLS)).toBe(1);
  });

  it('stands no canvas on a table with nothing to draw over it', async () => {
    const canvasNow = (): HTMLCanvasElement | null => (fixture.nativeElement as HTMLElement).querySelector('canvas');
    expect(canvasNow()).toBeNull();

    await show(hexScene());
    expect(canvasNow()?.width).toBeGreaterThan(0);

    scene.set(null);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(canvasNow()).toBeNull();

    await show(hexScene());
    expect(canvasNow()?.width).toBeGreaterThan(0);
  });

  it('builds it again for a board of another size', async () => {
    await show(hexScene());
    await show(hexScene({ widthPx: 600 }));

    expect(perfCounters.drain().get(PERF_HEX_SURFACE_CELLS)).toBe(2);
  });

  it('keeps its canvas out of sight on a table drawn on a canvas, and hands over the fog and the darkness apart', async () => {
    const veil = TestBed.inject(TableVeilService);
    await show(hexScene());
    const canvas = (fixture.nativeElement as HTMLElement).querySelector('canvas')!;
    expect(canvas.classList.contains('invisible')).toBe(false);
    expect(veil.veil()).toBeNull();

    TestBed.inject(Table3dService).choose('three');
    fixture.detectChanges();
    await fixture.whenStable();
    const first = veil.veil()?.revision ?? 0;
    await show(hexScene({ darknessLevel: 0.5 }));

    expect(canvas.classList.contains('invisible')).toBe(true);
    expect(veil.veil()?.canvas).toBe(canvas);
    expect(veil.veil()!.revision).toBeGreaterThan(first);
    expect(veil.veil()!.box.width).toBeGreaterThan(0);
    expect(veil.lightMap()?.canvas).not.toBe(canvas);
    expect(veil.lightMap()!.box).toEqual(veil.veil()!.box);
    expect(veil.lightMap()!.darkness).toBeGreaterThan(0);

    await show(hexScene({ darknessEnabled: false, fogEnabled: true }));

    expect(veil.lightMap()).toBeNull();

    TestBed.inject(Table3dService).choose('css');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(veil.veil()).toBeNull();
  });

  it('hands over the glow of a lamp the scene does not light itself, apart from the darkness', async () => {
    const veil = TestBed.inject(TableVeilService);
    TestBed.inject(Table3dService).choose('three');
    const lamp = {
      x: 200,
      y: 200,
      z: 25,
      brightPx: 100,
      dimPx: 200,
      color: '#ffaa55',
      angle: 360,
      direction: 0,
      pitch: 0,
      revealToAll: false,
      castShadows: false,
      ignoreOcclusion: false,
      animation: 'none',
      sourceId: 'lamp',
      surface: 'floor' as const,
    };

    await show(hexScene({ lights: [lamp] }));

    expect(veil.glow()?.canvas).not.toBe(veil.lightMap()?.canvas);
    expect(veil.glow()!.box).toEqual(veil.veil()!.box);

    await show(hexScene());

    expect(veil.glow()).toBeNull();
    TestBed.inject(Table3dService).choose('css');
  });
});
