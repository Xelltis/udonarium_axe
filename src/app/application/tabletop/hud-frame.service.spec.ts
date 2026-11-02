import { effect, Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HudFrameService } from '@axe/application/tabletop/hud-frame.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { Matrix3D } from '@axe/core/transform/matrix-3d';
import { DEFAULT_TABLE_CAMERA_VIEW } from '@axe/domain/tabletop/camera/table-camera';
import { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FLAT = { across: { x: 1, y: 0, z: 0 }, down: { x: 0, y: 1, z: 0 } };

function lying(id: string, x: number, y: number, z: number, size: number): TableWorldSprite {
  return {
    id,
    owner: id.split('#')[0],
    kind: 'dice-symbol',
    centre: { x, y, z },
    widthPx: size,
    heightPx: size,
    facing: FLAT,
    look: { kind: 'picture', url: 'a.png' },
    brightness: 1,
    twoSided: false,
  };
}

describe('HudFrameService', () => {
  let frame: HudFrameService;
  const sprites = signal<readonly TableWorldSprite[]>([]);
  const elements: HTMLElement[] = [];

  function element(): HTMLElement {
    const made = document.createElement('div');
    elements.push(made);
    return made;
  }

  beforeEach(() => {
    sprites.set([lying('die#frame', 100, 100, 0, 50), lying('die#picture', 100, 60, 10, 20)]);
    TestBed.configureTestingModule({
      providers: [
        { provide: TablePiecesService, useValue: { sprites, coins: signal([]) } },
        {
          provide: TableCameraService,
          useValue: {
            version: signal(0),
            view: DEFAULT_TABLE_CAMERA_VIEW,
            layout: { left: 0, top: 0, width: 800, height: 600, boardWidth: 1000, boardHeight: 1000 },
            sceneMatrix: () => new Matrix3D().identity(),
          },
        },
      ],
    });
    frame = TestBed.inject(HudFrameService);
  });

  afterEach(() => {
    elements.splice(0);
    vi.restoreAllMocks();
  });

  it('may be asked to put an element from within an effect', () => {
    const put = element();
    effect(() => frame.place(put, { owner: 'die' }), { injector: TestBed.inject(Injector) });

    expect(() => TestBed.tick()).not.toThrow();
    frame.writeNow();
    expect(put.style.transform).toBe('translate(75px, 50px)');
  });

  it('puts the root of a piece over the box round all of it', () => {
    const root = element();
    frame.place(root, { owner: 'die' });
    frame.writeNow();

    expect(root.style.transform).toBe('translate(75px, 50px)');
    expect(root.style.width).toBe('50px');
    expect(root.style.height).toBe('75px');
  });

  it('puts a part over its own box, within the root', () => {
    const part = element();
    frame.place(part, { owner: 'die', part: 'picture' });
    frame.writeNow();

    expect(part.style.transform).toBe('translate(15px, 0px)');
    expect(part.style.width).toBe('20px');
    expect(part.style.height).toBe('20px');
  });

  it('hangs a label over the middle of a part, at the size the part is drawn at', () => {
    const label = element();
    frame.place(label, { owner: 'die', part: 'picture', place: 'above' });
    frame.writeNow();

    expect(label.style.transform).toBe('translate(25px, 0px) scale(1) translate(-50%, -100%)');
  });

  it('lays an element on a part, its own box drawn onto the corners of the part, leaving its size alone', () => {
    const laid = element();
    laid.style.width = '20px';
    Object.defineProperty(laid, 'offsetWidth', { value: 20 });
    Object.defineProperty(laid, 'offsetHeight', { value: 20 });
    frame.place(laid, { owner: 'die', part: 'picture', place: 'face' });
    frame.writeNow();

    expect(laid.style.transform).toBe('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 15, 0, 0, 1)');
    expect(laid.style.width).toBe('20px');
  });

  it('puts the middle of an element on a point of a face, within the root', () => {
    vi.spyOn(TestBed.inject(TableSurfaceService), 'pageOf').mockReturnValue({ x: 100, y: 80 });
    const handle = element();
    frame.place(handle, { owner: 'die', at: { surface: 'floor', x: 1, y: 2, height: 3 } });
    frame.writeNow();

    expect(TestBed.inject(TableSurfaceService).pageOf).toHaveBeenCalledWith('floor', 1, 2, 3);
    expect(handle.style.transform).toBe('translate(25px, 30px) translate(-50%, -50%)');
  });

  it('draws an element put on a point at the size the table is drawn at there, where asked', () => {
    vi.spyOn(TestBed.inject(TableSurfaceService), 'pageOf').mockImplementation((_surface, x) => ({
      x: 100 + x * 0.5,
      y: 80,
    }));
    const orbit = element();
    frame.place(orbit, { owner: 'die', at: { surface: 'floor', x: 0, y: 0, height: 0 }, scaled: true });
    frame.writeNow();

    expect(orbit.style.transform).toBe('translate(25px, 30px) scale(0.5) translate(-50%, -50%)');
  });

  it('puts the middle of an element on a corner of a part', () => {
    const handle = element();
    frame.place(handle, { owner: 'die', part: 'picture', corner: 2 });
    frame.writeNow();

    expect(handle.style.transform).toBe('translate(35px, 20px) translate(-50%, -50%)');
  });

  it('draws the root of a nearer piece over the root of one further off', () => {
    sprites.update((drawn) => [...drawn, lying('near#frame', 300, 300, 40, 50)]);
    const far = element();
    const near = element();
    frame.place(far, { owner: 'die' });
    frame.place(near, { owner: 'near' });
    frame.writeNow();

    expect(Number(near.style.zIndex)).toBeGreaterThan(Number(far.style.zIndex));
  });

  it('hides what goes with a piece or a part not drawn, and shows it again once drawn', () => {
    const part = element();
    frame.place(part, { owner: 'die', part: 'pedestal' });
    frame.writeNow();
    expect(part.style.visibility).toBe('hidden');

    sprites.update((drawn) => [...drawn, lying('die#pedestal', 100, 100, 0, 40)]);
    frame.writeNow();
    expect(part.style.visibility).toBe('');
    expect(part.style.width).toBe('40px');
  });

  it('leaves an element where it was once it is no longer put', () => {
    const root = element();
    const stop = frame.place(root, { owner: 'die' });
    frame.writeNow();
    stop();

    sprites.set([lying('die#frame', 500, 500, 0, 50)]);
    frame.writeNow();

    expect(root.style.transform).toBe('translate(75px, 50px)');
  });
});
