import { PERF_SVG_BUILD, perfCounters } from '@axe/core/util/perf-counters';
import { DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { EFFECT_KINDS, PROJECTILE_STYLES } from '@axe/domain/effect/effect-kind';
import {
  glyphLookOf,
  type GlyphSource,
  kindGlyphSvg,
  paintableColor,
  presetGlyphSvg,
  ShapeColors,
} from '@axe/domain/effect/effect-shapes';

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

  it('gives every kind a mark of its own, none the plain disc an unknown kind is drawn as', () => {
    const unknown = kindGlyphSvg('unknown', colors);
    const marks = EFFECT_KINDS.map((kind) => kindGlyphSvg(kind, colors));

    expect(EFFECT_KINDS).toHaveLength(37);
    expect(marks.filter((mark) => mark === unknown)).toEqual([]);
    expect(new Set(marks).size).toBe(EFFECT_KINDS.length);
  });

  describe('the mark of a shot', () => {
    function shot(more: Partial<GlyphSource> = {}): GlyphSource {
      return { effectKind: 'projectile', projectileLook: 'bolt', impactKind: '', shotCount: 1, ...more };
    }

    function markOf(source: GlyphSource): string {
      return kindGlyphSvg(source.effectKind, colors, glyphLookOf(source));
    }

    it('is told by what flies: each look a shot may have is drawn differently', () => {
      const marks = PROJECTILE_STYLES.map((projectileLook) => markOf(shot({ projectileLook })));

      expect(new Set(marks).size).toBe(PROJECTILE_STYLES.length);
    });

    it('tells a magical bolt by what it lands as, and draws one that lands as anything else as the glowing ball', () => {
      const landings = ['', 'frost', 'bolt', 'rubble', 'vortex', 'miasma', 'smite', 'impact'];
      const marks = landings.map((impactKind) => markOf(shot({ impactKind })));

      expect(new Set(marks).size).toBe(landings.length);
      expect(markOf(shot({ impactKind: 'burst' }))).toBe(markOf(shot({ impactKind: 'flame' })));
    });

    it('leaves what an arrow or a bullet lands as out of its mark', () => {
      expect(markOf(shot({ projectileLook: 'arrow', impactKind: 'frost' }))).toBe(
        markOf(shot({ projectileLook: 'arrow', impactKind: 'impact' }))
      );
    });

    it('draws a second shot behind one fired several at a time', () => {
      const single = markOf(shot({ projectileLook: 'bullet' }));
      const volley = markOf(shot({ projectileLook: 'bullet', shotCount: 3 }));

      expect(volley).not.toBe(single);
      expect(volley.split('<g ').length - 1).toBe(2);
    });

    it('names no look for any other kind, whatever shot values the preset carries', () => {
      expect(glyphLookOf(shot({ effectKind: 'slash', projectileLook: 'arrow', shotCount: 4 }))).toBe('');
    });

    it('tells the shots that come with the tool apart: no mark is shared by more than four of that family', () => {
      const shots = DEFAULT_EFFECT_PRESET_SEEDS.filter((seed) => seed.tagName === '射撃');
      const shared = new Map<string, string[]>();
      for (const seed of shots) {
        const source: GlyphSource = {
          effectKind: seed.kind,
          projectileLook: seed.projectileStyle ?? 'bolt',
          impactKind: seed.impactKind ?? '',
          shotCount: seed.shots ?? 1,
        };
        const mark = kindGlyphSvg(source.effectKind, colors, glyphLookOf(source));
        shared.set(mark, [...(shared.get(mark) ?? []), seed.name]);
      }

      expect(shots.length).toBeGreaterThan(20);
      expect(Math.max(...[...shared.values()].map((names) => names.length))).toBeLessThanOrEqual(4);
      expect(shared.size).toBeGreaterThanOrEqual(Math.ceil(shots.length / 2));
    });

    it('draws a preset’s mark in the preset’s own colours', () => {
      const preset = shot({ projectileLook: 'missile', shotCount: 2 });
      const painted = { ...preset, colorPrimary: '#102030', colorSecondary: '#a0b0c0' };

      expect(presetGlyphSvg(painted)).toBe(
        kindGlyphSvg('projectile', { core: '#102030', edge: '#a0b0c0' }, glyphLookOf(preset))
      );
      expect(presetGlyphSvg(painted)).toContain('#102030');
    });
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
