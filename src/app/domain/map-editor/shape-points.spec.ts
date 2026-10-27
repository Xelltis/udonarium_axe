import { regularPolygonPoints, starPoints } from '@axe/domain/map-editor/shape-points';
import { describe, expect, it } from 'vitest';

function vertices(flat: number[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
  return out;
}

describe('regularPolygonPoints', () => {
  it('emits one vertex per side', () => {
    expect(vertices(regularPolygonPoints(0, 0, 10, 6, 0))).toHaveLength(6);
    expect(vertices(regularPolygonPoints(0, 0, 10, 3, 0))).toHaveLength(3);
  });

  it('clamps sides to a minimum of 3', () => {
    expect(vertices(regularPolygonPoints(0, 0, 10, 2, 0))).toHaveLength(3);
  });

  it('keeps every vertex on the circumscribed circle', () => {
    const verts = vertices(regularPolygonPoints(5, -2, 7, 8, 0.3));
    for (const v of verts) {
      const d = Math.hypot(v.x - 5, v.y + 2);
      expect(d).toBeCloseTo(7, 9);
    }
  });

  it('honors the start angle for the first vertex', () => {
    const verts = vertices(regularPolygonPoints(0, 0, 4, 5, Math.PI / 2));
    expect(verts[0].x).toBeCloseTo(0, 9);
    expect(verts[0].y).toBeCloseTo(4, 9);
  });

  it('spaces vertices evenly (rotational symmetry)', () => {
    const verts = vertices(regularPolygonPoints(0, 0, 10, 6, 0));
    for (let i = 0; i < verts.length; i += 1) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const edge = Math.hypot(a.x - b.x, a.y - b.y);
      expect(edge).toBeCloseTo(10, 6);
    }
  });
});

describe('starPoints', () => {
  it('emits two vertices per point', () => {
    expect(vertices(starPoints(0, 0, 10, 5, 5, 0))).toHaveLength(10);
    expect(vertices(starPoints(0, 0, 10, 5, 6, 0))).toHaveLength(12);
  });

  it('alternates outer and inner radii', () => {
    const verts = vertices(starPoints(0, 0, 10, 4, 5, 0));
    for (let i = 0; i < verts.length; i += 1) {
      const d = Math.hypot(verts[i].x, verts[i].y);
      expect(d).toBeCloseTo(i % 2 === 0 ? 10 : 4, 9);
    }
  });

  it('clamps points to a minimum of 2', () => {
    expect(vertices(starPoints(0, 0, 10, 5, 1, 0))).toHaveLength(4);
  });

  it('honors the start angle for the first outer vertex', () => {
    const verts = vertices(starPoints(3, 3, 6, 2, 5, -Math.PI / 2));
    expect(verts[0].x).toBeCloseTo(3, 9);
    expect(verts[0].y).toBeCloseTo(-3, 9);
  });
});
