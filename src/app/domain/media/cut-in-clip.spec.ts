import { clipCss, clipPoints, CUT_IN_CLIPS, isCutInClip } from '@axe/domain/media/cut-in-clip';

describe('isCutInClip()', () => {
  it('knows the shapes it has', () => {
    for (const clip of CUT_IN_CLIPS) expect(isCutInClip(clip)).toBe(true);
  });

  it('turns away anything else', () => {
    expect(isCutInClip('trapezoid')).toBe(false);
    expect(isCutInClip(null)).toBe(false);
  });
});

describe('clipPoints()', () => {
  it('cuts nothing off a layer keeping its own box', () => {
    expect(clipPoints('none')).toEqual([]);
  });

  it('cuts nothing off a layer under a name it does not know', () => {
    expect(clipPoints('trapezoid')).toEqual([]);
    expect(clipPoints('constructor')).toEqual([]);
  });

  it('leaves a round one to the browser rather than to corners', () => {
    expect(clipPoints('circle')).toEqual([]);
    expect(clipCss('circle')).toContain('ellipse');
  });

  it('leans a window over without changing how wide it is', () => {
    const corners = clipPoints('slant');

    expect(corners).toHaveLength(4);
    expect(corners[0][0]).toBeGreaterThan(0);
    expect(corners[1][0]).toBe(1);
    expect(corners[3][0]).toBe(0);
  });

  it('leans the other one the other way', () => {
    expect(clipPoints('slantBack')[0][0]).toBe(0);
    expect(clipPoints('slant')[0][0]).toBeGreaterThan(0);
  });

  it('bites teeth into a torn edge', () => {
    const corners = clipPoints('torn');

    expect(corners.length).toBeGreaterThan(8);
    // Something has to come in from the edge, or it is not torn.
    expect(corners.some(([x]) => x > 0 && x < 1)).toBe(true);
  });

  it('bites the teeth of a left-torn edge into its left side', () => {
    const teeth = clipPoints('tornLeft').filter(([x]) => x > 0 && x < 1);

    expect(teeth.length).toBeGreaterThan(0);
    // Every one of them near the left edge, which is what the name says.
    expect(teeth.every(([x]) => x < 0.5)).toBe(true);
  });

  it('bites them into the right side of a right-torn edge', () => {
    const teeth = clipPoints('torn')
      .filter(([x]) => x > 0 && x < 1)
      .filter(([x]) => x > 0.5);

    expect(teeth.length).toBeGreaterThan(0);
  });

  it('tears the same way every time, so a room looks the same on every screen', () => {
    expect(clipPoints('torn')).toEqual(clipPoints('torn'));
  });

  it('rips a gash that is wide, ragged and pointed at both ends', () => {
    const corners = clipPoints('gash');

    expect(corners.length).toBeGreaterThan(20);
    // It reaches both edges, and comes to a point rather than a flat end at each.
    expect(corners.filter(([x]) => x === 0)).toHaveLength(1);
    expect(corners.filter(([x]) => x === 1)).toHaveLength(1);
    // Nothing along it runs straight, which is what makes it a tear.
    const heights = new Set(corners.map(([, y]) => y));
    expect(heights.size).toBeGreaterThan(15);
  });

  it('bites into a gash a little way rather than halfway across', () => {
    const corners = clipPoints('gash');
    const middle = corners.filter(([x]) => x > 0.2 && x < 0.8);
    const top = middle.filter(([, y]) => y < 0.5).map(([, y]) => y);
    const bottom = middle.filter(([, y]) => y >= 0.5).map(([, y]) => y);

    // Along the middle of the tear the edges stay near the outside, teeth and all.
    expect(Math.max(...top)).toBeLessThan(0.3);
    expect(Math.min(...bottom)).toBeGreaterThan(0.7);
  });

  it('narrows a gash towards each end', () => {
    const corners = clipPoints('gash');
    const heightAt = (from: number, to: number) => {
      const slice = corners.filter(([x]) => x >= from && x <= to).map(([, y]) => y);
      return Math.max(...slice) - Math.min(...slice);
    };

    expect(heightAt(0.4, 0.6)).toBeGreaterThan(heightAt(0, 0.08));
    expect(heightAt(0.4, 0.6)).toBeGreaterThan(heightAt(0.92, 1));
  });

  it('gives a burst points that reach out and come back', () => {
    const reaches = clipPoints('burst').map(([x, y]) => Math.hypot(x - 0.5, y - 0.5));

    expect(Math.max(...reaches)).toBeGreaterThan(0.4);
    expect(Math.min(...reaches)).toBeLessThan(0.3);
  });

  it('gives a star ten corners', () => {
    expect(clipPoints('star')).toHaveLength(10);
  });

  it('keeps every shape inside the layer it belongs to', () => {
    for (const clip of CUT_IN_CLIPS) {
      for (const [x, y] of clipPoints(clip)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('clipCss()', () => {
  it('says nothing for a layer keeping its own box', () => {
    expect(clipCss('none')).toBe('');
  });

  it('says nothing for a layer under a name it does not know', () => {
    expect(clipCss('trapezoid')).toBe('');
  });

  it('writes the corners out as a polygon', () => {
    const css = clipCss('slant');

    expect(css.startsWith('polygon(')).toBe(true);
    expect(css).toContain('%');
    expect(css.split(',')).toHaveLength(4);
  });

  it('has something to say for every shape', () => {
    for (const clip of CUT_IN_CLIPS) {
      if (clip === 'none') continue;
      expect(clipCss(clip).length).toBeGreaterThan(0);
    }
  });
});
