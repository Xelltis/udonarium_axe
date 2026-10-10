import { AnchoredPopover, fitPopover } from '@axe/ui/anchored-popover';

describe('placing a popover against what it hangs off', () => {
  const view = { width: 1000, height: 800 };
  const fit = { width: 300, minHeight: 176 };

  function anchor(top: number, height = 20, left = 400, width = 40): DOMRect {
    return { top, bottom: top + height, left, right: left + width, width, height } as DOMRect;
  }

  it('opens downward where the room below is the greater', () => {
    const placed = fitPopover(anchor(100), fit, view, 200);

    expect(placed.opensUpward).toBe(false);
    expect(placed.top).toBe(126);
  });

  it('opens upward where the room above is the greater', () => {
    const placed = fitPopover(anchor(700), fit, view, 200);

    expect(placed.opensUpward).toBe(true);
    expect(placed.top).toBe(700 - 6 - 200);
  });

  it('sits centred on what it hangs off', () => {
    expect(fitPopover(anchor(100), fit, view, 200).left).toBe(400 + 20 - 150);
  });

  it('lines up with the left edge where it is asked to', () => {
    expect(fitPopover(anchor(100), { ...fit, align: 'start' }, view, 200).left).toBe(400);
  });

  it('keeps a margin from the edges of the window', () => {
    expect(fitPopover(anchor(100, 20, 0, 10), fit, view, 200).left).toBe(8);
    expect(fitPopover(anchor(100, 20, 995, 5), fit, view, 200).left).toBe(1000 - 300 - 8);
  });

  it('narrows to the window rather than hanging off it', () => {
    expect(fitPopover(anchor(100), fit, { width: 240, height: 800 }, 200).width).toBe(224);
  });

  it('is never given less height than it says it needs', () => {
    expect(fitPopover(anchor(380, 20), fit, { width: 1000, height: 420 }, 200).maxHeight).toBe(366);
    expect(fitPopover(anchor(200, 20), fit, { width: 1000, height: 240 }, 200).maxHeight).toBe(186);
  });
});

describe('a popover that hangs off something on the page', () => {
  let anchor: HTMLElement;
  let popover: HTMLElement;
  let held: AnchoredPopover;

  beforeEach(() => {
    anchor = document.createElement('div');
    popover = document.createElement('div');
    anchor.appendChild(popover);
    document.body.appendChild(anchor);
    popover.showPopover = () => undefined;
    popover.hidePopover = () => undefined;
    held = new AnchoredPopover(
      () => anchor,
      () => popover,
      { width: 200, minHeight: 100 }
    );
  });

  afterEach(() => {
    held.destroy();
    anchor.remove();
  });

  it('opens on being asked, and shuts on being asked again', () => {
    expect(held.toggle()).toBe(true);
    expect(held.isOpen()).toBe(true);
    expect(popover.style.display).toBe('flex');

    expect(held.toggle()).toBe(false);
    expect(held.isOpen()).toBe(false);
    expect(popover.style.display).toBe('');
  });

  it('shuts on a press outside it', () => {
    held.show();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(held.isOpen()).toBe(false);
  });

  it('stands open through a press inside it', () => {
    held.show();

    popover.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(held.isOpen()).toBe(true);
  });

  it('shuts on Escape, and stands through any other key', () => {
    held.show();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(held.isOpen()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(held.isOpen()).toBe(false);
  });

  it('opens nothing in a browser that cannot open one', () => {
    const cannot = new AnchoredPopover(
      () => anchor,
      () => document.createElement('div'),
      { width: 200, minHeight: 100 }
    );

    expect(cannot.toggle()).toBe(false);
    expect(cannot.isOpen()).toBe(false);
  });

  it('stops listening once it is done away with', () => {
    held.show();
    held.destroy();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(held.isOpen()).toBe(true);
  });
});
