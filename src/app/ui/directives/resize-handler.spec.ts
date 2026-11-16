import { HandleType, ResizeHandler } from '@axe/ui/directives/resize-handler';

describe('ResizeHandler', () => {
  let target: HTMLElement;

  function stripOf(handler: ResizeHandler): HTMLElement {
    return target.querySelector(`.ui-resize-handler-${handler.type}`) as HTMLElement;
  }

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    target.remove();
  });

  it('lays a strip over the element that listens for presses from the start', () => {
    const handler = new ResizeHandler(target, HandleType.E);

    const strip = stripOf(handler);
    expect(strip).not.toBeNull();
    expect(handler.input.target).toBe(strip);
    expect(handler.input.isDestroyed).toBe(false);
    handler.destroy();
  });

  it('lays an edge along its side and a corner on it, outside the box', () => {
    const north = new ResizeHandler(target, HandleType.N);
    const southEast = new ResizeHandler(target, HandleType.SE);

    expect(stripOf(north).style.top).toBe('-9px');
    expect(stripOf(north).style.height).toBe('12px');
    expect(stripOf(north).style.cursor).toBe('ns-resize');
    expect(stripOf(southEast).style.right).toBe('-9px');
    expect(stripOf(southEast).style.bottom).toBe('-9px');
    expect(stripOf(southEast).style.width).toBe('18px');
    expect(stripOf(southEast).style.cursor).toBe('nwse-resize');
    expect(stripOf(southEast).style.zIndex).toBe('2');
    north.destroy();
    southEast.destroy();
  });

  it('takes its strip away and stops listening once destroyed', () => {
    const handler = new ResizeHandler(target, HandleType.W);

    handler.destroy();

    expect(stripOf(handler)).toBeNull();
    expect(handler.input.isDestroyed).toBe(true);
  });
});
