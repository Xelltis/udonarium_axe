import { TestBed } from '@angular/core/testing';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { footprintOf, OverlapHitSource, TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';

function makeObject(identifier: string): TabletopObject {
  return { identifier, aliasName: 'character', name: identifier } as unknown as TabletopObject;
}

function makeElement(rect: { x: number; y: number; w: number; h: number }): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.w,
      bottom: rect.y + rect.h,
      width: rect.w,
      height: rect.h,
    }) as DOMRect;
  return el;
}

describe('TabletopOverlapService', () => {
  let service: TabletopOverlapService;

  beforeEach(() => {
    if (typeof document.elementsFromPoint !== 'function') {
      (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = () => [];
    }
    TestBed.configureTestingModule({});
    service = TestBed.inject(TabletopOverlapService);
  });

  // Several of these look at the browser through a spy. Left standing, the next test's spy
  // is the same one, carrying the calls the last test made into an assertion about its own.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns nothing without looking when the coordinates are not numbers', () => {
    const elementsFromPoint = vi.spyOn(document, 'elementsFromPoint').mockReturnValue([]);

    expect(service.findAt(Number.NaN, 0)).toEqual([]);
    expect(service.findAt(0, Number.POSITIVE_INFINITY)).toEqual([]);
    expect(service.findAt(undefined as unknown as number, 0)).toEqual([]);
    expect(elementsFromPoint).not.toHaveBeenCalled();

    elementsFromPoint.mockRestore();
  });

  it('registers and unregisters entries', () => {
    const obj = makeObject('a');
    const el = makeElement({ x: 0, y: 0, w: 10, h: 10 });
    service.register(obj, el);
    service.unregister('a');
    // No throw, no leak — verify by spying on elementsFromPoint returning nothing.
    vi.spyOn(document, 'elementsFromPoint').mockReturnValue([]);
    expect(service.findAt(5, 5)).toEqual([]);
  });

  it('returns whatever the browser reports under the point', () => {
    const obj1 = makeObject('a');
    const obj2 = makeObject('b');
    const el1 = makeElement({ x: 0, y: 0, w: 10, h: 10 });
    const el2 = makeElement({ x: 0, y: 0, w: 10, h: 10 });
    service.register(obj1, el1);
    service.register(obj2, el2);

    vi.spyOn(document, 'elementsFromPoint').mockReturnValue([el1, el2]);

    const result = service.findAt(5, 5);
    expect(result).toContain(obj1);
    expect(result).toContain(obj2);
  });

  it('returns nothing when the browser reports nothing', () => {
    const obj = makeObject('a');
    const el = makeElement({ x: 0, y: 0, w: 10, h: 10 });
    service.register(obj, el);
    vi.spyOn(document, 'elementsFromPoint').mockReturnValue([]);
    expect(service.findAt(5, 5)).toEqual([]);
  });

  it('dispatches a context menu event to a registered element', async () => {
    const obj = makeObject('a');
    const el = makeElement({ x: 0, y: 0, w: 10, h: 10 });
    document.body.appendChild(el);
    service.register(obj, el);

    const handler = vi.fn();
    el.addEventListener('contextmenu', handler);
    service.reopenContextMenuFor('a', 5, 6);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(handler).toHaveBeenCalledTimes(1);
    const ev = handler.mock.calls[0][0] as MouseEvent;
    expect(ev.clientX).toBe(5);
    expect(ev.clientY).toBe(6);
    document.body.removeChild(el);
  });

  it('does nothing for an identifier it does not know', () => {
    expect(() => service.reopenContextMenuFor('missing', 0, 0)).not.toThrow();
  });

  it('replaces the entry when the same identifier registers again', () => {
    const obj1 = makeObject('a');
    const el1 = makeElement({ x: 0, y: 0, w: 10, h: 10 });
    const el2 = makeElement({ x: 0, y: 0, w: 10, h: 10 });
    service.register(obj1, el1);
    service.register(obj1, el2);

    vi.spyOn(document, 'elementsFromPoint').mockReturnValue([el2]);
    expect(service.findAt(5, 5)).toContain(obj1);

    vi.spyOn(document, 'elementsFromPoint').mockReturnValue([el1]);
    expect(service.findAt(5, 5)).not.toContain(obj1);
  });

  it('forgets a piece by its element only while that is still the element on record', () => {
    const obj = makeObject('a');
    const old = makeElement({ x: 0, y: 0, w: 10, h: 10 });
    service.registerWithoutElement(obj, () => undefined);

    service.unregister('a', old);
    expect(service.get('a')?.element).toBeNull();

    service.unregister('a', null);
    expect(service.get('a')).toBeUndefined();
  });

  describe('pieces drawn with no element of their own', () => {
    it('finds them through what draws them, after the pieces found by their elements', () => {
      const drawn = makeObject('drawn');
      const element = makeElement({ x: 0, y: 0, w: 10, h: 10 });
      const merged = makeObject('merged');
      const face = document.createElement('div');
      service.register(drawn, element);
      service.registerWithoutElement(merged, () => undefined);
      const source: OverlapHitSource = vi.fn((hits) => (hits.includes(face) ? [merged] : []));
      service.addHitSource(source);
      vi.spyOn(document, 'elementsFromPoint').mockReturnValue([face, element]);

      expect(service.findAt(5, 6)).toEqual([drawn, merged]);
      expect(source).toHaveBeenCalledWith([face, element], 5, 6);
    });

    it('takes only pieces registered without an element from what draws them, and each once', () => {
      const merged = makeObject('merged');
      const stray = makeObject('stray');
      service.registerWithoutElement(merged, () => undefined);
      service.addHitSource(() => [merged, stray]);
      service.addHitSource(() => [merged]);
      vi.spyOn(document, 'elementsFromPoint').mockReturnValue([document.createElement('div')]);

      expect(service.findAt(5, 5)).toEqual([merged]);
    });

    it('stops asking what draws them once it is taken away', () => {
      const merged = makeObject('merged');
      service.registerWithoutElement(merged, () => undefined);
      const source: OverlapHitSource = () => [merged];
      service.addHitSource(source);
      service.removeHitSource(source);
      vi.spyOn(document, 'elementsFromPoint').mockReturnValue([document.createElement('div')]);

      expect(service.findAt(5, 5)).toEqual([]);
    });

    it('opens the menu of one picked out of the pieces under the pointer, at the pointer', async () => {
      const openMenu = vi.fn();
      service.registerWithoutElement(makeObject('merged'), openMenu);
      const prime = vi.spyOn(TestBed.inject(PointerDeviceService), 'primeForContextMenu');

      service.reopenContextMenuFor('merged', 5, 6);
      expect(openMenu).not.toHaveBeenCalled();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(prime).toHaveBeenCalledWith(5, 6);
      expect(openMenu).toHaveBeenCalledTimes(1);
    });
  });
});

describe('footprintOf', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads a terrain from its own size, without asking an element', () => {
    const terrain = Terrain.create('block', 2, 3, 1, '', '');
    const element = document.createElement('div');
    const width = vi.fn(() => 999);
    Object.defineProperty(element, 'offsetWidth', { get: width });

    expect(footprintOf({ object: terrain, element }, 50)).toEqual({ width: 100, height: 150 });
    expect(footprintOf({ object: terrain, element: null }, 50)).toEqual({ width: 100, height: 150 });
    expect(width).not.toHaveBeenCalled();
    terrain.destroy();
  });

  it('reads anything else from its element, and finds nothing to read without one', () => {
    const element = document.createElement('div');
    Object.defineProperty(element, 'offsetWidth', { value: 40 });
    Object.defineProperty(element, 'offsetHeight', { value: 30 });

    expect(footprintOf({ object: makeObject('piece'), element }, 50)).toEqual({ width: 40, height: 30 });
    expect(footprintOf({ object: makeObject('piece'), element: null }, 50)).toEqual({ width: 0, height: 0 });
  });
});
