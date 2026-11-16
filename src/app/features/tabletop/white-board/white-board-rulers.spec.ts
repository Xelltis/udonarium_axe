import {
  clampZoom,
  fitZoom,
  rulerTicks,
  scrollCentredOn,
  scrollKeepingPoint,
} from '@axe/features/tabletop/white-board/white-board-rulers';

describe('white board rulers', () => {
  it('spaces the numbers out further as the sheet shrinks', () => {
    expect(rulerTicks(200, 1).map((tick) => tick.at)).toEqual([0, 50, 100, 150, 200]);
    expect(rulerTicks(200, 0.5).map((tick) => tick.at)).toEqual([0, 100, 200]);
    expect(rulerTicks(200, 2).map((tick) => tick.px)).toEqual([0, 100, 200, 300, 400]);
    expect(rulerTicks(3000, 0.01).map((tick) => tick.at)).toEqual([0, 1000, 2000, 3000]);
  });

  it('keeps the zoom between a tenth and eight times', () => {
    expect(clampZoom(0.01)).toBe(0.1);
    expect(clampZoom(20)).toBe(8);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it('fits the sheet into the stage with a margin round it', () => {
    const stage = { scrollLeft: 0, scrollTop: 0, clientWidth: 424, clientHeight: 1024 };
    expect(fitZoom(stage, 200, 100)).toBe(2);
  });

  it('keeps the point under the pointer under the pointer, or the centre when there is none', () => {
    const stage = { scrollLeft: 100, scrollTop: 50, clientWidth: 400, clientHeight: 300 };
    const box = { left: 10, top: 20 };
    expect(scrollKeepingPoint(stage, box, { x: 210, y: 120 }, 1, 2)).toEqual({ scrollLeft: 400, scrollTop: 200 });
    expect(scrollKeepingPoint(stage, box, null, 1, 2)).toEqual({ scrollLeft: 400, scrollTop: 250 });
  });

  it('brings a point of the board to the middle of the stage at the zoom it is shown at', () => {
    const stage = { scrollLeft: 0, scrollTop: 0, clientWidth: 400, clientHeight: 300 };
    expect(scrollCentredOn(stage, { x: 300, y: 200 }, 2)).toEqual({ scrollLeft: 400, scrollTop: 250 });
  });
});
