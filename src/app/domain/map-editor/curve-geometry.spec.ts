import { catmullRomSegments, sampleCurvePoints } from '@axe/domain/map-editor/curve-geometry';
import { describe, expect, it } from 'vitest';

describe('catmullRomSegments', () => {
  it('returns an empty list for fewer than two vertices', () => {
    expect(catmullRomSegments([], false)).toEqual([]);
    expect(catmullRomSegments([1, 2], false)).toEqual([]);
  });

  it('ends each open segment exactly at the next vertex', () => {
    const points = [0, 0, 10, 0, 10, 10, 20, 10];
    const segments = catmullRomSegments(points, false);
    expect(segments.length).toBe(3);
    expect(segments[0].x).toBe(10);
    expect(segments[0].y).toBe(0);
    expect(segments[2].x).toBe(20);
    expect(segments[2].y).toBe(10);
  });

  it('wraps a closed curve back to the first vertex', () => {
    const points = [0, 0, 10, 0, 10, 10, 0, 10];
    const segments = catmullRomSegments(points, true);
    expect(segments.length).toBe(4);
    expect(segments[segments.length - 1].x).toBe(0);
    expect(segments[segments.length - 1].y).toBe(0);
  });
});

describe('sampleCurvePoints', () => {
  it('is safe for fewer than two vertices', () => {
    expect(sampleCurvePoints([1, 2], false)).toEqual([1, 2]);
    expect(sampleCurvePoints([], false)).toEqual([]);
  });

  it('passes through every input vertex', () => {
    const points = [0, 0, 10, 0, 10, 10, 20, 10];
    const sampled = sampleCurvePoints(points, false, 8);
    for (let i = 0; i < points.length; i += 2) {
      const hit = passesNear(sampled, points[i], points[i + 1]);
      expect(hit).toBe(true);
    }
  });

  it('degenerates a two-point open curve to the straight segment', () => {
    const sampled = sampleCurvePoints([0, 0, 10, 0], false, 4);
    for (let i = 0; i < sampled.length; i += 2) {
      expect(sampled[i + 1]).toBeCloseTo(0, 6);
    }
    expect(sampled[sampled.length - 2]).toBeCloseTo(10, 6);
  });

  it('ends a closed sampling near the start vertex', () => {
    const points = [0, 0, 10, 0, 10, 10, 0, 10];
    const sampled = sampleCurvePoints(points, true, 8);
    const lastX = sampled[sampled.length - 2];
    const lastY = sampled[sampled.length - 1];
    expect(Math.hypot(lastX - 0, lastY - 0)).toBeLessThan(1e-6);
  });
});

function passesNear(flat: number[], x: number, y: number): boolean {
  for (let i = 0; i < flat.length; i += 2) {
    if (Math.hypot(flat[i] - x, flat[i + 1] - y) < 1e-6) return true;
  }
  return false;
}
