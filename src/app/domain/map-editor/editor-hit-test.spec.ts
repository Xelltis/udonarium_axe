import { curveAnchorAt, fitImageSize, imageCorners, imageHandleAt } from '@axe/domain/map-editor/editor-hit-test';
import type { ImageItem, ShapeItem } from '@axe/domain/map-editor/scene';

function shape(points: number[]): ShapeItem {
  return { id: 's1', shape: 'polyline', points, fill: null, stroke: null, rotation: 0 };
}

function image(x: number, y: number, w: number, h: number): ImageItem {
  return { id: 'i1', imageIdentifier: 'img', x, y, w, h, rotation: 0, opacity: 1 };
}

describe('curveAnchorAt()', () => {
  const item = shape([100, 100, 200, 200]);

  it('returns which anchor was grabbed', () => {
    expect(curveAnchorAt(item, 100, 100)).toBe(0);
    expect(curveAnchorAt(item, 200, 200)).toBe(1);
  });

  it('forgives a small miss', () => {
    expect(curveAnchorAt(item, 106, 94)).toBe(0);
  });

  it('grabs nothing from far away', () => {
    expect(curveAnchorAt(item, 150, 150)).toBe(-1);
  });
});

describe('imageCorners()', () => {
  it('returns the four corners clockwise from the top left', () => {
    expect(imageCorners(image(100, 100, 40, 20))).toEqual([
      { x: 80, y: 90 },
      { x: 120, y: 90 },
      { x: 120, y: 110 },
      { x: 80, y: 110 },
    ]);
  });
});

describe('imageHandleAt()', () => {
  const item = image(100, 100, 40, 20);

  it('returns which corner was grabbed', () => {
    expect(imageHandleAt(item, 80, 90)).toBe(0);
    expect(imageHandleAt(item, 120, 110)).toBe(2);
  });

  it('grabs nothing along an edge', () => {
    expect(imageHandleAt(item, 100, 90)).toBe(-1);
  });
});

describe('fitImageSize()', () => {
  it('places a small image at its own size', () => {
    expect(fitImageSize(100, 50, 64)).toEqual({ w: 100, h: 50 });
  });

  it('fits a large image into eight cells', () => {
    const fit = fitImageSize(2048, 1024, 64);

    expect(fit.w).toBe(512);
    expect(fit.h).toBe(256);
  });

  it('gives an image of unknown size four cells', () => {
    expect(fitImageSize(0, 0, 64)).toEqual({ w: 256, h: 256 });
  });
});
