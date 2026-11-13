import { PERF_SVG_BUILD, perfCounters } from '@axe/core/util/perf-counters';
import { EFFECT_KINDS } from '@axe/domain/effect/effect-kind';
import { kindGlyphSvg, paintableColor, ShapeColors } from '@axe/domain/effect/effect-shapes';

describe('the marks of the kinds of effect', () => {
  const colors: ShapeColors = { core: '#ffffff', edge: '#3f9bff' };

  it('draws a mark in its own square box for every kind, and something for a kind it does not know', () => {
    for (const kind of [...EFFECT_KINDS, 'unknown']) {
      const markup = kindGlyphSvg(kind, colors);
      expect(markup.startsWith('<svg ')).toBe(true);
      expect(markup).toContain('viewBox="0 0 100 100"');
      expect(markup.endsWith('</svg>')).toBe(true);
    }
  });

  it('draws it in the preset’s own colours', () => {
    expect(kindGlyphSvg('slash', colors)).toContain(colors.core);
    expect(kindGlyphSvg('slash', colors)).toContain(colors.edge);
  });

  describe('the colours a mark is given', () => {
    it('keeps a colour written by hex, by name or by the rgb and hsl functions', () => {
      for (const color of [
        '#fff',
        '#ffd27f',
        '#ffd27f80',
        'red',
        'transparent',
        'rgb(1, 2, 3)',
        'hsla(10 20% 30% / 0.5)',
      ]) {
        expect(paintableColor(color, '#000')).toBe(color);
      }
    });

    it('puts anything else back to the fallback', () => {
      for (const color of ['#fff" data-x="1', '<b>bold</b>', "red'", 'url(x)', '', 12]) {
        expect(paintableColor(color, '#000')).toBe('#000');
      }
    });

    it('writes no other markup into any mark, whatever colours it is asked with', () => {
      const odd: ShapeColors = { core: '#fff" data-x="1', edge: '<b>bold</b>' };

      for (const markup of [kindGlyphSvg('slash', odd), kindGlyphSvg('burst', odd)]) {
        const host = document.createElement('div');
        host.innerHTML = markup;
        expect(markup).not.toContain('data-x');
        expect(host.querySelector('b')).toBeNull();
        expect(markup.includes('#ffd27f') || markup.includes('#ff5a33')).toBe(true);
      }
    });
  });

  describe('remembering', () => {
    it('hands the same mark back for the same colours and kind', () => {
      const own = { core: '#123456', edge: '#abcdef' };

      expect(kindGlyphSvg('frost', { ...own })).toBe(kindGlyphSvg('frost', own));
      expect(kindGlyphSvg('flame', own)).not.toBe(kindGlyphSvg('frost', own));
    });

    it('draws a mark once', () => {
      perfCounters.enabled = true;
      perfCounters.clear();
      const own = { core: '#0f0f0f', edge: '#f0f0f0' };

      kindGlyphSvg('heal', own);
      kindGlyphSvg('heal', own);
      kindGlyphSvg('heal', own);

      expect(perfCounters.drain().get(PERF_SVG_BUILD)).toBe(1);
      perfCounters.enabled = false;
    });
  });
});
