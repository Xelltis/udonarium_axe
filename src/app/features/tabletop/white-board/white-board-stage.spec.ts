import { ZOOM_STEP } from '@axe/features/tabletop/white-board/white-board-rulers';
import { BoardStage, BoardStageHost } from '@axe/features/tabletop/white-board/white-board-stage';

describe('BoardStage', () => {
  let element: HTMLElement | null;
  let drawn: (() => void)[];
  let stage: BoardStage;

  /** A stage 400 by 300 on screen, standing at the top left of the page. */
  function stageElement(): HTMLElement {
    const made = document.createElement('div');
    Object.defineProperty(made, 'clientWidth', { value: 400 });
    Object.defineProperty(made, 'clientHeight', { value: 300 });
    made.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
    return made;
  }

  /** A turn of the wheel, as far as the stage reads one. */
  function wheel(init: { ctrlKey?: boolean; deltaY: number; clientX?: number; clientY?: number }) {
    const event = { ctrlKey: false, metaKey: false, clientX: 0, clientY: 0, ...init, preventDefault: vi.fn() };
    return event as typeof event & WheelEvent;
  }

  function draw(): void {
    for (const then of drawn.splice(0)) then();
  }

  beforeEach(() => {
    element = stageElement();
    drawn = [];
    const host: BoardStageHost = {
      element: () => element,
      sheetWidth: () => 1000,
      sheetHeight: () => 750,
      afterDraw: (then) => drawn.push(then),
    };
    stage = new BoardStage(host);
  });

  it('steps the zoom up and down, and holds it within the sizes allowed', () => {
    stage.zoomIn();
    expect(stage.zoom()).toBeCloseTo(ZOOM_STEP);
    stage.zoomOut();
    expect(stage.zoom()).toBeCloseTo(1);

    stage.zoomTo(100);
    expect(stage.zoom()).toBe(8);
    stage.zoomTo('0.5');
    expect(stage.zoom()).toBe(0.5);
    expect(stage.zoomPercent()).toBe(50);
  });

  it('zooms before the sheet is drawn, with nothing to scroll', () => {
    element = null;

    stage.zoomTo(2);

    expect(stage.zoom()).toBe(2);
    expect(drawn).toHaveLength(0);
  });

  it('keeps the point under the pointer where it is, scrolling once the sheet is drawn at its new size', () => {
    const event = wheel({ ctrlKey: true, deltaY: -1, clientX: 100, clientY: 50 });

    stage.onWheel(event);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(stage.zoom()).toBeCloseTo(ZOOM_STEP);
    expect(element!.scrollLeft).toBe(0);
    draw();
    expect(element!.scrollLeft).toBeCloseTo(100 * ZOOM_STEP - 100);
    expect(element!.scrollTop).toBeCloseTo(50 * ZOOM_STEP - 50);
  });

  it('leaves a turn of the wheel without Ctrl to scroll the stage', () => {
    const event = wheel({ deltaY: -1 });

    stage.onWheel(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(stage.zoom()).toBe(1);
  });

  it('fits the whole sheet in the stage, less its margin', () => {
    stage.zoomToFit();

    expect(stage.zoom()).toBeCloseTo(Math.min((400 - 24) / 1000, (300 - 24) / 750));
  });

  it('fills the stage with one part of the sheet and brings its middle to the middle', () => {
    stage.zoomOnto({ x: 100, y: 100, w: 188, h: 100 });
    draw();

    expect(stage.zoom()).toBe(2);
    expect(element!.scrollLeft).toBe(194 * 2 - 200);
    expect(element!.scrollTop).toBe(150 * 2 - 150);
  });

  it('writes the numbers along each ruler at the size the sheet is shown', () => {
    stage.zoomTo(0.5);

    expect(stage.ticks('x').at(-1)).toEqual({ at: 1000, px: 500 });
    expect(stage.ticks('y').map((tick) => tick.at)).toEqual([0, 100, 200, 300, 400, 500, 600, 700]);
  });

  it('slides the sheet against the pointer while it is held, and not once let go', () => {
    element!.scrollLeft = 200;
    element!.scrollTop = 200;
    expect(stage.slide({ clientX: 10, clientY: 10 })).toBe(false);

    stage.startSlide({ clientX: 10, clientY: 10 });
    expect(stage.sliding()).toBe(true);
    expect(stage.slide({ clientX: 40, clientY: 25 })).toBe(true);
    expect(element!.scrollLeft).toBe(170);
    expect(element!.scrollTop).toBe(185);

    expect(stage.endSlide()).toBe(true);
    expect(stage.sliding()).toBe(false);
    expect(stage.endSlide()).toBe(false);
  });
});
