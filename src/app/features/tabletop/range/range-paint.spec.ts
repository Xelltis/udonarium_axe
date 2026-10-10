import { RangeArea } from '@axe/domain/tabletop/range';
import {
  initialRangeClip,
  rangeClipPathCss,
  rangeQuadrantCells,
  rangeRenderSettingOf,
} from '@axe/features/tabletop/range/range-paint';

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
