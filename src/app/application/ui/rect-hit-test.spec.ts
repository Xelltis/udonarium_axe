import { marqueeApply, normalizeRect, selectByRect } from '@axe/application/ui/rect-hit-test';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { makeFakeTabletopObject } from '@axe/testing/factories/tabletop-object.factory';

function makeObject(opts: {
  id: string;
  alias: string;
  x: number;
  y: number;
  size?: number;
  width?: number;
  height?: number;
  location?: string;
}): TabletopObject {
  return makeFakeTabletopObject({
    identifier: opts.id,
    aliasName: opts.alias,
    x: opts.x,
    y: opts.y,
    size: opts.size,
    width: opts.width,
    height: opts.height,
    locationName: opts.location,
  });
}

describe('normalizeRect', () => {
  it('normalises a rectangle dragged backwards', () => {
    expect(normalizeRect({ x1: 100, y1: 50, x2: 10, y2: 80 })).toEqual({ x1: 10, y1: 50, x2: 100, y2: 80 });
  });
});

describe('selectByRect', () => {
  it('returns the objects on the table whose centres fall inside the rectangle', () => {
    const objects: TabletopObject[] = [
      makeObject({ id: 'a', alias: 'character', x: 0, y: 0, size: 1 }),
      makeObject({ id: 'b', alias: 'character', x: 200, y: 200, size: 1 }),
    ];
    const hits = selectByRect(objects, { x1: 0, y1: 0, x2: 100, y2: 100 });
    expect(hits).toEqual(['a']);
  });

  it('leaves out anything not on the table, the graveyard included', () => {
    const objects: TabletopObject[] = [
      makeObject({ id: 'a', alias: 'character', x: 0, y: 0, size: 1, location: 'graveyard' }),
    ];
    expect(selectByRect(objects, { x1: -100, y1: -100, x2: 100, y2: 100 })).toEqual([]);
  });

  it('leaves range areas out by default', () => {
    const objects: TabletopObject[] = [
      makeObject({ id: 'a', alias: 'range', x: 0, y: 0, size: 1 }),
      makeObject({ id: 'b', alias: 'character', x: 0, y: 0, size: 1 }),
    ];
    expect(selectByRect(objects, { x1: -100, y1: -100, x2: 100, y2: 100 })).toEqual(['b']);
  });

  it('takes a different exclusion list when asked', () => {
    const objects: TabletopObject[] = [
      makeObject({ id: 'a', alias: 'character', x: 0, y: 0, size: 1 }),
      makeObject({ id: 'b', alias: 'terrain', x: 0, y: 0, width: 1, height: 1 }),
    ];
    const hits = selectByRect(objects, { x1: -100, y1: -100, x2: 100, y2: 100 }, { excludeAliases: ['character'] });
    expect(hits).toEqual(['b']);
  });

  it('judges a sized object by its centre', () => {
    const objects: TabletopObject[] = [makeObject({ id: 'a', alias: 'terrain', x: 0, y: 0, width: 2, height: 4 })];
    // centre = (0 + 2*50/2, 0 + 4*50/2) = (50, 100)
    expect(selectByRect(objects, { x1: 40, y1: 90, x2: 60, y2: 110 })).toEqual(['a']);
    expect(selectByRect(objects, { x1: 0, y1: 0, x2: 40, y2: 40 })).toEqual([]);
  });

  it('judges the same rectangle given corner-first or corner-last', () => {
    const objects: TabletopObject[] = [makeObject({ id: 'a', alias: 'character', x: 0, y: 0, size: 1 })];
    expect(selectByRect(objects, { x1: 100, y1: 100, x2: -100, y2: -100 })).toEqual(['a']);
  });
});

describe('marqueeApply()', () => {
  const keys = (over: Partial<{ shift: boolean; ctrl: boolean; touch: boolean }> = {}) => ({
    shift: false,
    ctrl: false,
    touch: false,
    ...over,
  });

  it('stands in for the whole selection by default', () => {
    expect(marqueeApply(keys(), false)).toBe('replace');
    expect(marqueeApply(keys(), true)).toBe('replace');
  });

  it('adds to it while shift is held', () => {
    expect(marqueeApply(keys({ shift: true }), true)).toBe('add');
  });

  it('toggles what it catches while ctrl is held', () => {
    expect(marqueeApply(keys({ ctrl: true }), false)).toBe('toggle');
  });

  it('toggles for a finger once something is already picked out', () => {
    expect(marqueeApply(keys({ touch: true }), true)).toBe('toggle');
  });

  it('stands in for the lot for a finger with nothing picked out yet', () => {
    expect(marqueeApply(keys({ touch: true }), false)).toBe('replace');
  });

  it('lets shift win over a finger, for a pen or a keyboard beside the screen', () => {
    expect(marqueeApply(keys({ shift: true, touch: true }), true)).toBe('add');
  });
});
