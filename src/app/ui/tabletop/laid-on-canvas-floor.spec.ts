import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FloorCanvasesService } from '@axe/application/tabletop/floor-canvases.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { laidOnCanvasFloor } from '@axe/ui/tabletop/laid-on-canvas-floor';
import type { MockInstance } from 'vitest';

describe('laidOnCanvasFloor()', () => {
  let floors: FloorCanvasesService;
  let show: MockInstance<FloorCanvasesService['show']>;
  let forget: MockInstance<FloorCanvasesService['forget']>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    floors = TestBed.inject(FloorCanvasesService);
    show = vi.spyOn(floors, 'show');
    forget = vi.spyOn(floors, 'forget');
  });

  afterEach(() => vi.restoreAllMocks());

  function setup(canvas: ReturnType<typeof signal<HTMLCanvasElement | undefined>>, id = signal('path')) {
    const painted = TestBed.runInInjectionContext(() =>
      laidOnCanvasFloor({ id: () => id(), canvas: () => canvas(), heightPx: () => 3 })
    );
    TestBed.tick();
    return painted;
  }

  it('lays the canvas on the floor once the page has painted it, and not before', () => {
    const canvas = signal<HTMLCanvasElement | undefined>(document.createElement('canvas'));
    const painted = setup(canvas);
    expect(show).not.toHaveBeenCalled();

    painted();

    expect(show).toHaveBeenCalledWith('path', canvas(), 3);
  });

  it('lays nothing while the page has no canvas', () => {
    const painted = setup(signal<HTMLCanvasElement | undefined>(undefined));

    painted();

    expect(show).not.toHaveBeenCalled();
  });

  it('takes the canvas up again once the page has none, and when the part is gone', () => {
    const canvas = signal<HTMLCanvasElement | undefined>(document.createElement('canvas'));
    const painted = setup(canvas);
    painted();

    canvas.set(undefined);
    TestBed.tick();
    expect(forget).toHaveBeenCalledWith('path');

    canvas.set(document.createElement('canvas'));
    TestBed.tick();
    painted();
    expect(show).toHaveBeenCalledTimes(2);

    TestBed.resetTestingModule();
    expect(forget).toHaveBeenCalledTimes(2);
  });

  it('takes up the canvas laid under one name before laying it under another', () => {
    const canvas = signal<HTMLCanvasElement | undefined>(document.createElement('canvas'));
    const id = signal('one');
    const painted = setup(canvas, id);
    painted();

    id.set('two');
    painted();

    expect(forget).toHaveBeenCalledWith('one');
    expect(show).toHaveBeenLastCalledWith('two', canvas(), 3);
  });
});
