import { PERF_SVG_BUILD, perfCounters } from '@axe/core/util/perf-counters';
import {
  arrowSvg,
  boltSvg,
  bulletSvg,
  cloudSvg,
  crackSvg,
  crescentSvg,
  impactStarSvg,
  kindGlyphSvg,
  magicCircleSvg,
  paintableColor,
  ringSvg,
  ShapeColors,
  snowflakeSvg,
  speedLinesSvg,
  spikeSvg,
  spiralSvg,
} from '@axe/domain/effect/effect-shapes';

describe('the shapes of the effects', () => {
  const colors: ShapeColors = { core: '#ffffff', edge: '#3f9bff' };

  const builders: [string, () => string][] = [
    ['三日月', () => crescentSvg(colors)],
    ['輪', () => ringSvg(colors)],
    ['魔法陣', () => magicCircleSvg(colors)],
    ['結晶', () => snowflakeSvg(colors)],
    ['螺旋', () => spiralSvg(colors)],
    ['地割れ', () => crackSvg(colors, 8, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8])],
    ['霧', () => cloudSvg(colors)],
    ['氷柱', () => spikeSvg(colors)],
    ['矢', () => arrowSvg(colors)],
    ['銃弾', () => bulletSvg(colors)],
    ['衝撃の星', () => impactStarSvg(colors)],
    ['集中線', () => speedLinesSvg(colors)],
  ];

  it('returns a drawing with its own box for every shape', () => {
    for (const [, build] of builders) {
      const markup = build();
      expect(markup.startsWith('<svg ')).toBe(true);
      expect(markup).toContain('viewBox="0 0 100 100"');
      expect(markup.endsWith('</svg>')).toBe(true);
    }
  });

  it('returns the same text for the same arguments', () => {
    for (const [, build] of builders) {
      expect(build()).toBe(build());
    }
  });

  it('puts the colour in', () => {
    expect(ringSvg(colors)).toContain(colors.edge);
    expect(magicCircleSvg(colors)).toContain(colors.core);
  });

  it('changes the identifiers of its definitions with the colour', () => {
    const other: ShapeColors = { core: '#ffe9a8', edge: '#ff9d3d' };
    const idOf = (markup: string) => markup.match(/id="([^"]+)"/)?.[1];

    for (const build of [crescentSvg, cloudSvg, spikeSvg]) {
      // Two of an identifier would let one effect pick up the gradient of another fired at the same moment.
      expect(idOf(build(colors))).not.toBe(idOf(build(other)));
      expect(idOf(build(colors))).toBe(idOf(build(colors)));
    }
  });

  it('draws a ring as a line rather than a fill', () => {
    const markup = ringSvg(colors, 4);

    expect(markup).toContain('fill="none"');
    expect(markup).toContain('stroke-width');
  });

  it('breaks it where it is asked to', () => {
    expect(ringSvg(colors, 4, true)).toContain('stroke-dasharray');
    expect(ringSvg(colors, 4, false)).not.toContain('stroke-dasharray');
  });

  it('draws an arrow pointing right', () => {
    const markup = arrowSvg(colors);

    // Its head sits at the right edge, and whoever uses it turns it where it should point.
    expect(markup).toContain('99,50');
    expect(markup).toContain('<rect');
  });

  it('gives a bullet a tail behind it', () => {
    expect(bulletSvg(colors)).toContain('linearGradient');
  });

  it('gives the star of an impact a jagged outline', () => {
    const markup = impactStarSvg(colors, 12);
    const points = markup.match(/points="([^"]+)"/)?.[1].split(' ') ?? [];

    // It alternates between the outer and the inner radius, so there are twice as many points as spikes.
    expect(points).toHaveLength(24);
  });

  it('draws as many speed lines as it is asked for', () => {
    expect(speedLinesSvg(colors, 10).match(/<line /g)).toHaveLength(10);
  });

  it('gathers the bolt and its branches into one path', () => {
    const jitter = [0.5, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6, 0.5, 0.35, 0.65];
    const markup = boltSvg(80, 400, 30, 6, jitter, [0.4, 0.6, 0.3, 0.7, 0.5, 0.5], colors);

    expect(markup.match(/M[\d.]+ [\d.]+/g)?.length).toBeGreaterThan(1);
    expect(markup.match(/<path/g)).toHaveLength(3);
    expect(markup).toContain('stroke-linejoin="round"');
  });

  it('runs the bolt from the top edge to the bottom', () => {
    const jitter = [0.5, 0.5, 0.5, 0.5, 0.5];
    const markup = boltSvg(60, 300, 20, 5, jitter, [], colors);
    const points = [...markup.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((match) => Number(match[2]));

    expect(Math.min(...points)).toBe(0);
    expect(Math.max(...points)).toBe(300);
  });

  describe('the colours a drawing is given', () => {
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

    it('writes no other markup into any drawing, whatever colours it is asked with', () => {
      const odd: ShapeColors = { core: '#fff" data-x="1', edge: '<b>bold</b>' };
      const drawings = [
        crescentSvg(odd),
        ringSvg(odd),
        magicCircleSvg(odd),
        snowflakeSvg(odd),
        spikeSvg(odd),
        impactStarSvg(odd),
        kindGlyphSvg('slash', odd),
        kindGlyphSvg('burst', odd),
      ];

      for (const markup of drawings) {
        const host = document.createElement('div');
        host.innerHTML = markup;
        expect(markup).not.toContain('data-x');
        expect(host.querySelector('b')).toBeNull();
        expect(markup.includes('#ffd27f') || markup.includes('#ff5a33')).toBe(true);
      }
    });
  });

  describe('remembering', () => {
    it('hands the same drawing back for the same colours and shape', () => {
      const colors = { core: '#123456', edge: '#abcdef' };
      const first = ringSvg(colors, 5, true);
      const again = ringSvg({ ...colors }, 5, true);
      const other = ringSvg(colors, 6, true);

      expect(again).toBe(first);
      expect(other).not.toBe(first);
    });

    it('builds a drawing once', () => {
      perfCounters.enabled = true;
      perfCounters.clear();
      const colors = { core: '#0f0f0f', edge: '#f0f0f0' };

      crescentSvg(colors, 30);
      crescentSvg(colors, 30);
      crescentSvg(colors, 30);

      expect(perfCounters.drain().get(PERF_SVG_BUILD)).toBe(1);
      perfCounters.enabled = false;
    });
  });
});
