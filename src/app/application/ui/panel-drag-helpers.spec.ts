import { findDropZone, isTabbablePanel, pointerOf, TabbablePanelFacts } from '@axe/application/ui/panel-drag-helpers';

function rect(left: number, top: number, right: number, bottom: number) {
  return { left, top, right, bottom };
}

function zoneAt(z: number, bar = rect(0, 0, 100, 28), strip: ReturnType<typeof rect> | null = null) {
  return { zone: { bar, strip, z } };
}

function panel(overrides: Partial<TabbablePanelFacts> = {}): TabbablePanelFacts {
  return {
    isCutIn: false,
    cutInIdentifier: '',
    layer: 0,
    frameless: false,
    invisible: false,
    ghost: false,
    windowed: false,
    ...overrides,
  };
}

describe('isTabbablePanel', () => {
  it('takes an ordinary panel', () => {
    expect(isTabbablePanel(panel())).toBe(true);
  });

  it('leaves a cut-in out of it', () => {
    expect(isTabbablePanel(panel({ isCutIn: true }))).toBe(false);
    expect(isTabbablePanel(panel({ cutInIdentifier: 'a-cut-in' }))).toBe(false);
  });

  it('leaves out a panel given a shelf of its own', () => {
    expect(isTabbablePanel(panel({ layer: 170 }))).toBe(false);
  });

  it('leaves out a panel wearing no box', () => {
    expect(isTabbablePanel(panel({ frameless: true }))).toBe(false);
    expect(isTabbablePanel(panel({ ghost: true }))).toBe(false);
    expect(isTabbablePanel(panel({ invisible: true }))).toBe(false);
  });

  it('leaves out a panel already in a window of its own', () => {
    expect(isTabbablePanel(panel({ windowed: true }))).toBe(false);
  });
});

describe('findDropZone', () => {
  it('answers with nothing where no bar lies under the pointer', () => {
    expect(findDropZone({ x: 50, y: 200 }, [zoneAt(1)])).toBeNull();
  });

  it('answers with the bar under the pointer', () => {
    const zone = zoneAt(1);

    expect(findDropZone({ x: 50, y: 14 }, [zone])).toBe(zone);
  });

  it('answers with the one in front where two lie under the pointer', () => {
    const behind = zoneAt(1);
    const inFront = zoneAt(5);

    expect(findDropZone({ x: 50, y: 14 }, [behind, inFront])).toBe(inFront);
    expect(findDropZone({ x: 50, y: 14 }, [inFront, behind])).toBe(inFront);
  });

  it('counts the row of names as well as the bar', () => {
    const zone = zoneAt(1, rect(0, 0, 100, 28), rect(0, 28, 100, 56));

    expect(findDropZone({ x: 50, y: 40 }, [zone])).toBe(zone);
  });

  it('counts nothing below what a frame offers', () => {
    expect(findDropZone({ x: 50, y: 60 }, [zoneAt(1, rect(0, 0, 100, 28), rect(0, 28, 100, 56))])).toBeNull();
  });
});

describe('pointerOf', () => {
  it('reads where a mouse is', () => {
    expect(pointerOf({ clientX: 12, clientY: 34 } as MouseEvent)).toEqual({ x: 12, y: 34 });
  });

  it('reads where a finger is', () => {
    const touch = { clientX: 5, clientY: 6 };
    const event = { touches: [touch], changedTouches: [touch] } as unknown as TouchEvent;

    expect(pointerOf(event)).toEqual({ x: 5, y: 6 });
  });

  it('reads where a finger just left', () => {
    const touch = { clientX: 7, clientY: 8 };
    const event = { touches: [], changedTouches: [touch] } as unknown as TouchEvent;

    expect(pointerOf(event)).toEqual({ x: 7, y: 8 });
  });
});
