import { DieLabels, labelOf } from '@axe/domain/dice/dice-3d/dice-throw-plan';
import { DIE_SHAPES, DieShape, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { dot, sub } from '@axe/domain/dice/dice-3d/rotation';
import { diceMeshOf, faceFramesOf } from '@axe/infrastructure/dice-3d/dice-geometry';
import { FaceGlyph, faceGlyphsOf } from '@axe/infrastructure/dice-3d/dice-glyphs';
import { NUMERAL_GAP, NUMERAL_HEIGHT, NUMERALS } from '@axe/infrastructure/dice-3d/dice-numerals';

type Point = [number, number];

const LABELS: Readonly<Record<DieShape, readonly DieLabels[]>> = {
  d4: ['standard'],
  d6: ['standard', 'd3'],
  d8: ['standard'],
  d10: ['standard', 'tens'],
  d12: ['standard'],
  d20: ['standard'],
};

/**
 * The flat part of a face, inside its rounded edges, in the coordinates of its cell: the ring of
 * corners the mesh lays the face out with, after its middle, the faces coming first and in order.
 */
function flatFaceOf(shape: DieShape, face: number): Point[] {
  const mesh = diceMeshOf(shape);
  const faces = polyhedronOf(shape).faces;
  const frame = faceFramesOf(shape)[face];
  const first = faces.slice(0, face).reduce((sum, f) => sum + f.length + 1, 0) + 1;
  return faces[face].map((_, corner) => {
    const i = first + corner;
    const d = sub([mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]], frame.centre);
    return [0.5 + dot(d, frame.right) / (2 * frame.reach), 0.5 + dot(d, frame.up) / (2 * frame.reach)];
  });
}

/** The corners of the box a mark's ink fills, an underline included, in the coordinates of its cell. */
function inkOf(glyph: FaceGlyph): Point[] {
  let halfWidth: number;
  let above: number;
  let below: number;
  if (glyph.kind === 'pip') {
    halfWidth = above = below = glyph.size / 2;
  } else {
    const figures = [...glyph.text].map((figure) => NUMERALS[figure]);
    const ink = figures.reduce((sum, f) => sum + f.right - f.left, 0) + NUMERAL_GAP * (figures.length - 1);
    const unit = glyph.size / NUMERAL_HEIGHT;
    halfWidth = (ink * unit) / 2;
    above = glyph.size / 2 + 14 * unit;
    below = glyph.size / 2 + (glyph.underline ? NUMERAL_HEIGHT * 0.21 : 14) * unit;
  }
  const cos = Math.cos(glyph.rotation);
  const sin = Math.sin(glyph.rotation);
  return [
    [-halfWidth, above],
    [halfWidth, above],
    [halfWidth, -below],
    [-halfWidth, -below],
  ].map(([x, y]) => [glyph.x + x * cos - y * sin, glyph.y + x * sin + y * cos]);
}

/** How far a point lies inside a convex polygon, by its nearest edge; negative when outside. */
function depthInside(polygon: Point[], [x, y]: Point): number {
  const turn = Math.sign(
    (polygon[1][0] - polygon[0][0]) * (polygon[2][1] - polygon[0][1]) -
      (polygon[1][1] - polygon[0][1]) * (polygon[2][0] - polygon[0][0])
  );
  return Math.min(
    ...polygon.map(([ax, ay], i) => {
      const [bx, by] = polygon[(i + 1) % polygon.length];
      const length = Math.hypot(bx - ax, by - ay);
      return (turn * ((bx - ax) * (y - ay) - (by - ay) * (x - ax))) / length;
    })
  );
}

describe('faceGlyphsOf', () => {
  for (const shape of DIE_SHAPES) {
    for (const labels of LABELS[shape]) {
      it(`keeps every mark of a ${shape} (${labels}) on the flat of its face, clear of the rounded edges`, () => {
        polyhedronOf(shape).faces.forEach((_, face) => {
          const flat = flatFaceOf(shape, face);
          for (const glyph of faceGlyphsOf(shape, labels, face)) {
            for (const corner of inkOf(glyph)) expect(depthInside(flat, corner)).toBeGreaterThan(0.01);
          }
        });
      });
    }
  }

  it('wears pips on a d6, as many as its number, the one large and in the accent', () => {
    for (let face = 0; face < 6; face++) {
      const glyphs = faceGlyphsOf('d6', 'standard', face);
      const value = Number(labelOf('d6', 'standard', face));
      expect(glyphs).toHaveLength(value);
      expect(glyphs.every((g) => g.kind === 'pip')).toBe(true);
      expect(glyphs.every((g) => g.accent === (value === 1))).toBe(true);
    }
  });

  it('writes numbers on a d6 standing in for a d3', () => {
    const glyphs = faceGlyphsOf('d6', 'd3', 0);
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0].kind).toBe('text');
    expect(['1', '2', '3']).toContain(glyphs[0].text);
  });

  it('marks a 6 and a 9 beneath, and no other number', () => {
    for (const shape of DIE_SHAPES.filter((s) => s !== 'd4' && s !== 'd6')) {
      polyhedronOf(shape).faces.forEach((_, face) => {
        const [glyph] = faceGlyphsOf(shape, 'standard', face);
        expect(glyph.underline).toBe(glyph.text === '6' || glyph.text === '9');
      });
    }
  });

  it('stands each number of a d4 upright toward its own corner', () => {
    const poly = polyhedronOf('d4');
    poly.faces.forEach((corners, face) => {
      const glyphs = faceGlyphsOf('d4', 'standard', face);
      expect(glyphs.map((g) => g.text)).toEqual(corners.map((corner) => labelOf('d4', 'standard', corner)));
      glyphs.forEach((glyph) => {
        const away = [glyph.x - 0.5, glyph.y - 0.5];
        const up = [-Math.sin(glyph.rotation), Math.cos(glyph.rotation)];
        expect((away[0] * up[0] + away[1] * up[1]) / Math.hypot(away[0], away[1])).toBeCloseTo(1, 6);
      });
    });
  });
});
