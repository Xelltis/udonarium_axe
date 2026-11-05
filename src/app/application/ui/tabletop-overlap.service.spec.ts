import { TestBed } from '@angular/core/testing';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { footprintOf, TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { PickHit } from '@axe/domain/tabletop/pick/pick-index';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

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
    TestBed.configureTestingModule({ providers: TEST_PROVIDERS });
    service = TestBed.inject(TabletopOverlapService);
  });

  // Several of these look at the table through a spy. Left standing, the next test's spy
  // is the same one, carrying the calls the last test made into an assertion about its own.
  afterEach(() => vi.restoreAllMocks());

  const hit = (id: string) => ({ target: { id } }) as unknown as PickHit;

  it('lists what the line of sight through a point meets, nearest first, each once and only what it knows', () => {
    const near = makeObject('near');
    const far = makeObject('far');
    const merged = makeObject('merged');
    service.register(far, makeElement({ x: 0, y: 0, w: 10, h: 10 }));
    service.register(near, makeElement({ x: 0, y: 0, w: 10, h: 10 }));
    service.registerWithoutElement(merged, () => undefined);
    const allAt = vi
      .spyOn(TestBed.inject(TablePickService), 'allAt')
      .mockReturnValue([hit('near'), hit('near'), hit('merged'), hit('far'), hit('gone')]);

    expect(service.findAt(5, 6)).toEqual([near, merged, far]);
    expect(allAt).toHaveBeenCalledWith(5, 6);
  });

  it('returns nothing without looking when the coordinates are not numbers', () => {
    const allAt = vi.spyOn(TestBed.inject(TablePickService), 'allAt');

    expect(service.findAt(Number.NaN, 0)).toEqual([]);
    expect(service.findAt(0, Number.POSITIVE_INFINITY)).toEqual([]);
    expect(service.findAt(undefined as unknown as number, 0)).toEqual([]);
    expect(allAt).not.toHaveBeenCalled();
  });

  it('forgets a piece unregistered, and keeps the last of two registered by one identifier', () => {
    const obj = makeObject('a');
    const first = makeElement({ x: 0, y: 0, w: 10, h: 10 });
    const second = makeElement({ x: 0, y: 0, w: 10, h: 10 });
    service.register(obj, first);
    service.register(obj, second);
    expect(service.get('a')?.element).toBe(second);

    service.unregister('a');
    vi.spyOn(TestBed.inject(TablePickService), 'allAt').mockReturnValue([hit('a')]);
    expect(service.findAt(5, 5)).toEqual([]);
  });

  describe('the piece drawn in front at a point', () => {
    it('is the registered piece whose element holds the topmost element there', () => {
      const piece = makeObject('front');
      const element = makeElement({ x: 0, y: 0, w: 10, h: 10 });
      const inner = document.createElement('span');
      element.appendChild(inner);
      service.register(piece, element);
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(inner);

      expect(service.drawnAt(5, 5)).toBe(piece);
    });

    it('is nothing where the front of the page belongs to no piece, or the point is not a number', () => {
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(document.createElement('div'));
      expect(service.drawnAt(5, 5)).toBeNull();
      expect(service.drawnAt(Number.NaN, 5)).toBeNull();
    });
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

  it('reads a piece registered with its footprint from that, rather than from its element', () => {
    const element = document.createElement('div');
    const width = vi.fn(() => 267);
    Object.defineProperty(element, 'offsetWidth', { get: width });
    TestBed.configureTestingModule({ providers: TEST_PROVIDERS });
    const service = TestBed.inject(TabletopOverlapService);
    const piece = makeObject('piece');
    service.register(piece, element, () => ({ width: 50, height: 50 }));

    const [entry] = service.entries().filter((each) => each.object === piece);

    expect(footprintOf(entry, 50)).toEqual({ width: 50, height: 50 });
    expect(width).not.toHaveBeenCalled();
    service.unregister(piece.identifier);
  });
});
