import {
  movePortraitFit,
  PORTRAIT_FIT_LIMIT,
  PORTRAIT_FIT_OFFSET_MAX,
  PORTRAIT_FIT_SCALE_MAX,
  PORTRAIT_FIT_SCALE_MIN,
  portraitFitFor,
  portraitFitOf,
  portraitFitTransform,
  readPortraitFits,
  unpackPortraitFit,
  WHOLE_PORTRAIT_FIT,
  withPortraitFits,
  zoomPortraitFit,
} from '@axe/domain/media/cut-in-portrait-fit';
import { describe, expect, it } from 'vitest';

describe('cut-in portrait fit', () => {
  it('holds a fit to its bounds and reads anything but finite numbers as none', () => {
    expect(portraitFitOf(100, -9, 9)).toEqual({
      scale: PORTRAIT_FIT_SCALE_MAX,
      x: -PORTRAIT_FIT_OFFSET_MAX,
      y: PORTRAIT_FIT_OFFSET_MAX,
    });
    expect(portraitFitOf(0, 0, 0)?.scale).toBe(PORTRAIT_FIT_SCALE_MIN);
    expect(portraitFitOf(Number.NaN, 0, 0)).toBeNull();
    expect(portraitFitOf('2', 0, 0)).toBeNull();
    expect(unpackPortraitFit([1.5, 0.1, -0.2])).toEqual({ scale: 1.5, x: 0.1, y: -0.2 });
    expect(unpackPortraitFit([1.5, 0.1])).toBeNull();
    expect(unpackPortraitFit({ scale: 1 })).toBeNull();
  });

  it('reads nothing from an empty, broken or unknown value, and leaves out a fit it cannot read', () => {
    expect(readPortraitFits('').size).toBe(0);
    expect(readPortraitFits(undefined).size).toBe(0);
    expect(readPortraitFits('{').size).toBe(0);
    expect(readPortraitFits('{"v":2,"fits":{"a":[2,0,0]}}').size).toBe(0);
    const fits = readPortraitFits('{"v":1,"fits":{"a":[2,0.1,0.2],"b":"x","":[1,0,0]}}');
    expect([...fits.keys()]).toEqual(['a']);
    expect(portraitFitFor('{"v":1,"fits":{"a":[2,0.1,0.2]}}', 'a')).toEqual({ scale: 2, x: 0.1, y: 0.2 });
    expect(portraitFitFor('{"v":1,"fits":{"a":[2,0.1,0.2]}}', 'b')).toBeNull();
    expect(portraitFitFor('{"v":1,"fits":{"a":[2,0.1,0.2]}}', '')).toBeNull();
  });

  it('writes fits that read back the same, and removes one given none', () => {
    const held = withPortraitFits(
      '',
      new Map([
        ['a', { scale: 2, x: 0.25, y: -0.5 }],
        ['b', { scale: 1.5, x: 0, y: 0 }],
      ]),
      ['a', 'b']
    );
    expect(portraitFitFor(held, 'a')).toEqual({ scale: 2, x: 0.25, y: -0.5 });
    const cleared = withPortraitFits(held, new Map([['a', null]]), ['a', 'b']);
    expect(portraitFitFor(cleared, 'a')).toBeNull();
    expect(portraitFitFor(cleared, 'b')).toEqual({ scale: 1.5, x: 0, y: 0 });
    expect(withPortraitFits(cleared, new Map([['b', null]]), ['a', 'b'])).toBe('');
  });

  it('drops the fits of pictures the character no longer has, and the oldest past the limit', () => {
    const held = withPortraitFits(
      '',
      new Map([
        ['gone', WHOLE_PORTRAIT_FIT],
        ['kept', WHOLE_PORTRAIT_FIT],
      ]),
      ['gone', 'kept']
    );
    expect([...readPortraitFits(withPortraitFits(held, new Map(), ['kept'])).keys()]).toEqual(['kept']);

    const pictures = Array.from({ length: PORTRAIT_FIT_LIMIT + 3 }, (_, index) => `p${index}`);
    const many = withPortraitFits('', new Map(pictures.map((picture) => [picture, WHOLE_PORTRAIT_FIT])), pictures);
    const left = [...readPortraitFits(many).keys()];
    expect(left.length).toBe(PORTRAIT_FIT_LIMIT);
    expect(left).not.toContain('p0');
    expect(left).toContain(`p${PORTRAIT_FIT_LIMIT + 2}`);
  });

  it('keeps what is under the pointer in place as it zooms', () => {
    const fit = { scale: 1, x: 0.1, y: -0.1 };
    const at = { x: 0.3, y: 0.2 };
    const zoomed = zoomPortraitFit(fit, 2, at);
    expect(zoomed.scale).toBe(2);
    const under = (f: typeof fit) => ({ x: (at.x - f.x) / f.scale, y: (at.y - f.y) / f.scale });
    expect(under(zoomed).x).toBeCloseTo(under(fit).x, 4);
    expect(under(zoomed).y).toBeCloseTo(under(fit).y, 4);
    expect(zoomPortraitFit({ scale: PORTRAIT_FIT_SCALE_MAX, x: 0, y: 0 }, 2).scale).toBe(PORTRAIT_FIT_SCALE_MAX);
  });

  it('moves by a share of the slot, held to its bounds', () => {
    expect(movePortraitFit(WHOLE_PORTRAIT_FIT, 0.1, -0.2)).toEqual({ scale: 1, x: 0.1, y: -0.2 });
    expect(movePortraitFit(WHOLE_PORTRAIT_FIT, 9, 0).x).toBe(PORTRAIT_FIT_OFFSET_MAX);
  });

  it('writes a fit as a transform in shares of the slot', () => {
    expect(portraitFitTransform({ scale: 1.5, x: 0.25, y: -0.1 })).toBe('translate(25%, -10%) scale(1.5)');
  });
});
