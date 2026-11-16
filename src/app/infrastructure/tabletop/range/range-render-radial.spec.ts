import { GridType } from '@axe/domain/tabletop/game-table';
import { renderCircle, renderCorn } from '@axe/infrastructure/tabletop/range/range-render-radial';
import { RangeRenderSetting } from '@axe/infrastructure/tabletop/range/range-render-types';
import { contextThatRecords, RecordedCall } from '@axe/testing/fake-canvas-context';

function createCanvasMock() {
  const canvas = document.createElement('canvas');
  const { context, calls } = contextThatRecords();
  vi.spyOn(canvas, 'getContext').mockReturnValue(context);
  return { canvas, calls };
}

/** The arguments of every call of one method, in order. */
function argsOf(calls: RecordedCall[], name: string): (readonly unknown[])[] {
  return calls.filter((call) => call.name === name).map((call) => call.args);
}

function makeSetting(overrides: Partial<RangeRenderSetting> = {}): RangeRenderSetting {
  return {
    areaWidth: 10,
    areaHeight: 20,
    range: 2,
    width: 1,
    centerX: 0,
    centerY: 0,
    gridSize: 10,
    type: 'CIRCLE',
    gridColor: '#ff0000',
    rangeColor: '#0000ff',
    fanDegree: 360,
    degree: 0,
    offSetX: false,
    offSetY: false,
    fillOutLine: true,
    gridType: GridType.SQUARE,
    isDocking: false,
    ...overrides,
  };
}

describe('range-render-radial', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('on a canvas taller than it is wide', () => {
    it('draws a circle about the middle of the canvas and marks its origin there', () => {
      const outline = createCanvasMock();

      renderCircle(createCanvasMock().canvas, outline.canvas, makeSetting());

      expect(argsOf(outline.calls, 'arc')).toEqual([
        [50, 100, 20, 0, 2 * Math.PI, true],
        [50, 100, 5, 0, 2 * Math.PI, true],
      ]);
    });

    it('marks the origin of a circle following a character with a square about the middle', () => {
      const outline = createCanvasMock();

      renderCircle(createCanvasMock().canvas, outline.canvas, makeSetting({ isDocking: true }));

      expect(argsOf(outline.calls, 'strokeRect')).toEqual([[44, 94, 12, 12]]);
      expect(argsOf(outline.calls, 'arc')).toHaveLength(1);
    });

    it('marks the origin of a cone at the middle of the canvas', () => {
      const outline = createCanvasMock();

      renderCorn(createCanvasMock().canvas, outline.canvas, makeSetting({ type: 'CORN' }));

      expect(argsOf(outline.calls, 'moveTo')).toEqual([[50, 100]]);
      expect(argsOf(outline.calls, 'arc')).toEqual([[50, 100, 5, 0, 2 * Math.PI, true]]);
    });
  });
});
