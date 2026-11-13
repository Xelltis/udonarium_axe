import { RangeArea } from '@axe/domain/tabletop/range';
import {
  initialRangeClip,
  rangeClipOutline,
  rangeClipPathCss,
  rangeQuadrantCells,
  rangeRenderSettingOf,
  regionWithinOutline,
} from '@axe/infrastructure/tabletop/range/range-paint';

describe('range-paint', () => {
  const made: RangeArea[] = [];

  afterEach(() => {
    for (const range of made.splice(0)) range.destroy();
  });

  function rangeOf(type: string, length: number, width = 0): RangeArea {
    const range = RangeArea.create('範囲', width, length, 100);
    range.type = type;
    range.location = { name: 'table', x: 150, y: 200 };
    made.push(range);
    return range;
  }

  it('outlines a range as its cells are cut, a circle walked round finely and a polygon by its corners', () => {
    const circle = rangeClipOutline({ kind: 'circle' }, rangeOf('CIRCLE', 3), 50);
    expect(circle).toHaveLength(64);
    for (const { x, y } of circle) expect(Math.hypot(x, y)).toBeCloseTo(225);

    const square = rangeOf('SQUARE', 2);
    const clip = initialRangeClip('SQUARE');
    const corners = rangeClipOutline(clip, square, 50);
    expect(rangeClipPathCss(clip, square, 50)).toBe(
      `polygon(${corners.map(({ x, y }) => `${x}px ${y}px`).join(', ')})`
    );
    expect(rangeClipOutline({ kind: 'custom', halfWidthPx: 75, halfHeightPx: 20 }, square, 50)).toEqual([
      { x: -125, y: -100 },
      { x: 125, y: -100 },
      { x: 125, y: 100 },
      { x: -125, y: 100 },
    ]);
  });

  it('pictures only the part of the canvases a range’s outline reaches, and none where it reaches none', () => {
    const canvases = { left: -1600, top: -1600, width: 3200, height: 3200 };
    const line = [
      { x: -10.5, y: -25 },
      { x: 500.2, y: -25 },
      { x: 500.2, y: 25 },
      { x: -10.5, y: 25 },
    ];

    expect(regionWithinOutline(canvases, line)).toEqual({ left: -11, top: -25, width: 512, height: 50 });
    expect(regionWithinOutline({ left: 0, top: 0, width: 100, height: 100 }, line)).toEqual({
      left: 0,
      top: 0,
      width: 100,
      height: 25,
    });
    expect(regionWithinOutline({ left: 600, top: 0, width: 100, height: 100 }, line)).toBeNull();
    expect(regionWithinOutline(canvases, [])).toEqual(canvases);
  });

  it('reaches as far out as the shape could at any turn, and a cell more', () => {
    expect(rangeQuadrantCells(rangeOf('CIRCLE', 3))).toBe(5);
    expect(rangeQuadrantCells(rangeOf('LINE', 4, 3))).toBe(6);
    expect(rangeQuadrantCells(rangeOf('CORN', 0, 0))).toBe(3);
  });

  it('hands the painters the range as the table lies, at its own turn unless told another', () => {
    const range = rangeOf('SQUARE', 0.5, 0.05);
    range.rotate = 30;

    const setting = rangeRenderSettingOf(range, { gridSize: 50, gridType: 1, docked: true });

    expect(setting).toMatchObject({
      areaWidth: 6,
      areaHeight: 6,
      range: 1,
      width: 0.1,
      centerX: 150,
      centerY: 200,
      gridSize: 50,
      degree: 30,
      gridType: 1,
      isDocking: true,
    });
    expect(rangeRenderSettingOf(range, { gridSize: 50, gridType: 0, docked: false, degree: 45 }).degree).toBe(45);
  });

  it('cuts a circle round, a custom shape to its box, and the rest to their outline', () => {
    const circle = rangeOf('CIRCLE', 2);
    expect(rangeClipPathCss({ kind: 'circle' }, circle, 50)).toBe('circle(175px)');

    const custom = rangeOf('CUSTOM', 0);
    expect(rangeClipPathCss({ kind: 'custom', halfWidthPx: 120, halfHeightPx: 10 }, custom, 50)).toBe(
      'polygon(-170px -100px, 170px -100px, 170px 100px, -170px 100px)'
    );

    expect(rangeClipPathCss(initialRangeClip('TRIANGLE'), rangeOf('TRIANGLE', 2), 50)).toBe(
      'polygon(0px -100px, 100px 100px, -100px 100px)'
    );
  });
});
