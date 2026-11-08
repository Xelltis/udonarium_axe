import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FloorCanvasesService } from '@axe/application/tabletop/floor-canvases.service';
import {
  type FloorMark,
  type FloorMarkLayer,
  floorMarkLayersOf,
  floorMarksBox,
  layFloorMarks,
  paintFloorMarks,
} from '@axe/ui/tabletop/floor-marks';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ring: FloorMark = { kind: 'circle', x: 100, y: 50, r: 20, stroke: { colour: '#fff', widthPx: 4 } };
const way: FloorMark = {
  kind: 'line',
  points: [
    { x: 10, y: 10 },
    { x: 60, y: 30 },
  ],
  stroke: { colour: '#0ea5e9', widthPx: 2 },
};

@Component({ template: '' })
class HostComponent {
  readonly layers = signal<readonly FloorMarkLayer[]>([]);

  constructor() {
    layFloorMarks('marks', () => this.layers());
  }
}

describe('the marks laid on the floor of a table drawn on a canvas', () => {
  afterEach(() => vi.restoreAllMocks());

  it('boxes marks round all they reach, their outlines included, and nothing round none', () => {
    expect(floorMarksBox([ring])).toEqual({ x: 74, y: 24, width: 52, height: 52 });
    expect(floorMarksBox([ring, way])!.x).toBe(5);
    expect(floorMarksBox([])).toBeNull();
  });

  it('paints marks on a canvas as large as the box round them, saying where that box lies over the board', () => {
    const canvas = document.createElement('canvas');
    const drawn: string[] = [];
    const context = new Proxy({} as CanvasRenderingContext2D, {
      get: (_, name: string) =>
        ['arc', 'moveTo', 'lineTo', 'stroke', 'fill'].includes(name) ? () => drawn.push(name) : () => undefined,
      set: () => true,
    });
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as never);

    expect(paintFloorMarks(canvas, [ring, way])).toBe(true);

    expect([canvas.style.left, canvas.style.top, canvas.style.width]).toEqual(['5px', '5px', '121px']);
    expect(canvas.width).toBe(121);
    expect(drawn).toEqual(['arc', 'stroke', 'moveTo', 'lineTo', 'stroke']);
    expect(paintFloorMarks(canvas, [])).toBe(false);
  });

  it('gathers marks laid at the same height into one layer, lowest first', () => {
    const layers = floorMarkLayersOf([
      { heightPx: 4, marks: [ring] },
      { heightPx: 0, marks: [way] },
      { heightPx: 4, marks: [way] },
    ]);

    expect(layers.map((layer) => [layer.heightPx, layer.marks.length])).toEqual([
      [0, 1],
      [4, 2],
    ]);
  });

  it('lays a canvas on the floor for each height marks lie at, and takes them up once there are none or it goes', () => {
    const fixture = TestBed.createComponent(HostComponent);
    const floors = TestBed.inject(FloorCanvasesService);
    TestBed.tick();
    expect(floors.all()).toEqual([]);

    fixture.componentInstance.layers.set([
      { heightPx: 0.25, marks: [way] },
      { heightPx: 50, marks: [ring] },
    ]);
    TestBed.tick();
    expect(floors.all().map((laid) => [laid.id, laid.heightPx])).toEqual([
      ['marks-0', 0.25],
      ['marks-1', 50],
    ]);

    fixture.componentInstance.layers.set([{ heightPx: 0.25, marks: [way] }]);
    TestBed.tick();
    expect(floors.all().map((laid) => laid.id)).toEqual(['marks-0']);

    fixture.destroy();
    expect(floors.all()).toEqual([]);
  });
});
