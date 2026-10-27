import { floorBoundsOf, gridSlideOf, gridViewportOf } from '@axe/features/tabletop/terrain/terrain-grid';

describe('the grid on a block', () => {
  it('lays a square block’s grid over the whole of it, and a hex block’s over the box round its hexes', () => {
    expect(floorBoundsOf(100, 50, null)).toEqual({ left: 0, top: 0, width: 100, height: 50 });
    expect(floorBoundsOf(100, 100, { minX: -40, minY: -30, maxX: 40, maxY: 30 })).toEqual({
      left: 10,
      top: 20,
      width: 80,
      height: 60,
    });
  });

  it('draws an unturned block’s grid on a canvas the size of its floor, where the block stands', () => {
    const viewport = gridViewportOf({ left: 0, top: 0, width: 100, height: 50 }, 0, { x: 200, y: 300 });

    expect(viewport).toMatchObject({ canvasLeft: 0, canvasTop: 0, canvasWidth: 100, canvasHeight: 50 });
    expect([viewport.offsetLeft, viewport.offsetTop]).toEqual([200, 300]);
  });

  it('widens the canvas of a turned block to cover its floor', () => {
    const viewport = gridViewportOf({ left: 0, top: 0, width: 100, height: 50 }, 90, { x: 0, y: 0 });

    expect(viewport.canvasWidth).toBeCloseTo(50);
    expect(viewport.canvasHeight).toBeCloseTo(100);
    expect(viewport.canvasLeft).toBeCloseTo(25);
  });

  it('cuts the grid from the corner of the cell a block stands in and slides the canvas back', () => {
    const viewport = gridViewportOf({ left: 0, top: 0, width: 100, height: 100 }, 0, { x: 130, y: 70 });

    expect(gridSlideOf(viewport, 50, 0)).toMatchObject({
      offsetLeft: 100,
      offsetTop: 50,
      slideX: -30,
      slideY: -20,
      grow: 50,
    });
  });

  it('cuts the grid afresh for a turned block, or one standing off the pixel grid', () => {
    const turned = gridViewportOf({ left: 0, top: 0, width: 100, height: 100 }, 30, { x: 130, y: 70 });
    const off = gridViewportOf({ left: 0, top: 0, width: 100, height: 100 }, 0, { x: 130.5, y: 70 });

    expect(gridSlideOf(turned, 50, 30).grow).toBe(0);
    expect(gridSlideOf(off, 50, 0)).toMatchObject({ offsetLeft: 130.5, slideX: 0, grow: 0 });
  });
});
