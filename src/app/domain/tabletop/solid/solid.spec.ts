import { GridType } from '@axe/domain/tabletop/grid-type';
import { rangeCovers } from '@axe/domain/tabletop/range-coverage';
import { footprintReach, rangeFootprint } from '@axe/domain/tabletop/solid/range-footprint';
import { Solid, solidFrame, SolidInput, solidOf } from '@axe/domain/tabletop/solid/solid';
import { asSolidKind, isAimedSolid, solidKindOf, solidKindsFor } from '@axe/domain/tabletop/solid/solid-kind';
import { solidEntryAlong, solidTouchesSegment } from '@axe/domain/tabletop/solid/solid-touch';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';

const SQ = 50;

function input(more: Partial<SolidInput>): SolidInput {
  return {
    kind: 'column',
    type: 'CIRCLE',
    length: 2,
    width: 1,
    rotate: 0,
    origin: { x: 500, y: 500 },
    cellPattern: '',
    gridType: GridType.SQUARE,
    squarePx: SQ,
    originZ: 0,
    height: 2,
    pitch: 0,
    ...more,
  };
}

function solid(more: Partial<SolidInput>): Solid {
  const made = solidOf(input(more));
  if (!made) throw new Error('expected a solid');
  return made;
}

/** The upright line of a piece standing at a point, from its foot to the top of its body. */
function body(x: number, y: number, foot: number, tall = SQ): [Vec3, Vec3] {
  return [
    { x, y, z: foot },
    { x, y, z: foot + tall },
  ];
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe('solid kinds', () => {
  it('reads anything it does not know as flat', () => {
    expect(asSolidKind('sphere')).toBe('sphere');
    expect(asSolidKind('dome')).toBe('');
    expect(asSolidKind(undefined)).toBe('');
    expect(asSolidKind('')).toBe('');
  });

  it('offers every shape a column, and the round kinds only to their own shape', () => {
    expect(solidKindsFor('CIRCLE')).toEqual(['', 'column', 'sphere']);
    expect(solidKindsFor('CORN')).toEqual(['', 'column', 'cone']);
    expect(solidKindsFor('LINE')).toEqual(['', 'column', 'beam']);
    expect(solidKindsFor('HEXAGON')).toEqual(['', 'column']);
    expect(solidKindsFor('CUSTOM')).toEqual(['', 'column']);
  });

  it('stands a kind that no longer fits its shape up as a column', () => {
    expect(solidKindOf('sphere', 'SQUARE')).toBe('column');
    expect(solidKindOf('sphere', 'CIRCLE')).toBe('sphere');
    expect(solidKindOf('', 'CIRCLE')).toBe('');
  });

  it('tells the kinds that point from a tip', () => {
    expect(isAimedSolid('cone')).toBe(true);
    expect(isAimedSolid('beam')).toBe(true);
    expect(isAimedSolid('sphere')).toBe(false);
    expect(isAimedSolid('column')).toBe(false);
  });
});

describe('solidOf', () => {
  it('gives nothing for a flat range', () => {
    expect(solidOf(input({ kind: '' }))).toBeNull();
  });

  it('raises a column from its point through its height in squares', () => {
    const column = solid({ originZ: 30, height: 3 });
    expect(column).toMatchObject({ kind: 'column', bottom: 30, top: 180 });
  });

  it('measures a solid as a range is drawn, at least a square long and a tenth of a square wide', () => {
    expect(solid({ kind: 'sphere', length: 0 })).toMatchObject({ radius: SQ });
    expect(solid({ kind: 'beam', type: 'LINE', width: 0 })).toMatchObject({ halfWidth: SQ * 0.05 });
    expect(solid({ height: Number.NaN })).toMatchObject({ top: SQ * 0.1 });
  });

  it('points a cone the way the range is turned, tipped up by its pitch', () => {
    const frame = solidFrame(90, 30);
    expect(frame.way.x).toBeCloseTo(0);
    expect(frame.way.y).toBeCloseTo(Math.cos(Math.PI / 6));
    expect(frame.way.z).toBeCloseTo(0.5);
    expect(frame.side.x).toBeCloseTo(-1);
    expect(frame.lift.z).toBeCloseTo(Math.cos(Math.PI / 6));
  });

  it('keeps the three ways of a frame square to one another', () => {
    const random = seeded(3);
    for (let i = 0; i < 50; i++) {
      const { way, side, lift } = solidFrame(random() * 360, random() * 180 - 90);
      const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
      expect(dot(way, side)).toBeCloseTo(0);
      expect(dot(way, lift)).toBeCloseTo(0);
      expect(dot(side, lift)).toBeCloseTo(0);
      expect(dot(way, way)).toBeCloseTo(1);
    }
  });
});

describe('rangeFootprint', () => {
  it('covers the same ground the flat range takes a piece in on, for every shape it does', () => {
    const random = seeded(11);
    for (const type of ['CIRCLE', 'SQUARE', 'LINE']) {
      for (let i = 0; i < 300; i++) {
        const shape = { type, length: 1 + random() * 4, width: random() * 3, rotate: random() * 360 };
        const point = { x: 500 + (random() - 0.5) * 600, y: 500 + (random() - 0.5) * 600 };
        const column = solid({ ...shape, kind: 'column', height: 2 });
        const flat = rangeCovers({ ...shape, origin: { x: 500, y: 500 } }, SQ, point);
        expect(solidTouchesSegment(column, ...body(point.x, point.y, 0))).toBe(flat);
      }
    }
  });

  it('lays a regular polygon with its first corner straight up, turned with the range', () => {
    const [triangle] = rangeFootprint({ ...input({}), type: 'TRIANGLE', length: 2 });
    expect(triangle.kind).toBe('polygon');
    if (triangle.kind !== 'polygon') return;
    expect(triangle.corners[0].x).toBeCloseTo(500);
    expect(triangle.corners[0].y).toBeCloseTo(400);
    const [turned] = rangeFootprint({ ...input({}), type: 'TRIANGLE', length: 2, rotate: 90 });
    if (turned.kind !== 'polygon') return;
    expect(turned.corners[0].x).toBeCloseTo(600);
    expect(turned.corners[0].y).toBeCloseTo(500);
  });

  it('opens a fan from its start out to its width', () => {
    const [fan] = rangeFootprint({ ...input({}), type: 'CORN', length: 3, width: 2 });
    if (fan.kind !== 'polygon') throw new Error('expected a polygon');
    expect(fan.corners).toEqual([
      { x: 500, y: 500 },
      { x: 650, y: 450 },
      { x: 650, y: 550 },
    ]);
  });

  it('reads a shape it does not know as a fan, as it is drawn', () => {
    expect(rangeFootprint({ ...input({}), type: 'SOMETHING' })).toEqual(rangeFootprint({ ...input({}), type: 'CORN' }));
  });

  it('lays the cells of a range of its own cells on the squares of the grid from the square its point is in', () => {
    const parts = rangeFootprint({ ...input({}), type: 'CUSTOM', cellPattern: '0,0;1,0', origin: { x: 520, y: 530 } });
    expect(parts).toHaveLength(2);
    expect(parts[1]).toEqual({
      kind: 'polygon',
      corners: [
        { x: 550, y: 500 },
        { x: 600, y: 500 },
        { x: 600, y: 550 },
        { x: 550, y: 550 },
      ],
    });
  });

  it('turns the cells of a range of its own cells by the nearest quarter turn', () => {
    const parts = rangeFootprint({
      ...input({}),
      type: 'CUSTOM',
      cellPattern: '1,0',
      origin: { x: 525, y: 525 },
      rotate: 80,
    });
    expect(parts[0]).toMatchObject({ corners: [{ x: 500, y: 550 }, {}, {}, {}] });
  });

  it('lays the cells of a range of its own cells on the hexagons of a hex table', () => {
    for (const gridType of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const parts = rangeFootprint({ ...input({}), type: 'CUSTOM', cellPattern: '0,0;1,0', gridType });
      expect(parts).toHaveLength(2);
      for (const part of parts) expect(part.kind === 'polygon' && part.corners.length).toBe(6);
      const column = solid({ type: 'CUSTOM', cellPattern: '0,0', gridType });
      expect(solidTouchesSegment(column, ...body(500, 500, 0))).toBe(true);
    }
  });

  it('measures how far the furthest of its ground lies from its point', () => {
    expect(footprintReach(rangeFootprint({ ...input({}), length: 3 }), { x: 500, y: 500 })).toBeCloseTo(150);
    expect(footprintReach(rangeFootprint({ ...input({}), type: 'SQUARE', length: 1 }), { x: 500, y: 500 })).toBeCloseTo(
      Math.SQRT2 * 50
    );
  });
});

describe('solidTouchesSegment', () => {
  it('takes a piece in on a column only where its body reaches the column, from foot to head', () => {
    const column = solid({ height: 2 });
    expect(solidTouchesSegment(column, ...body(520, 500, 0))).toBe(true);
    expect(solidTouchesSegment(column, ...body(520, 500, 150))).toBe(false);
    expect(solidTouchesSegment(column, ...body(520, 500, 60, 50))).toBe(true);
    expect(solidTouchesSegment(column, ...body(520, 500, -70, 50))).toBe(false);
    expect(solidTouchesSegment(column, ...body(520, 500, -50, 50))).toBe(true);
  });

  it('takes a piece in on a sphere where any of its body lies within the radius', () => {
    const sphere = solid({ kind: 'sphere', length: 2, originZ: 0 });
    expect(solidTouchesSegment(sphere, ...body(500, 500, 90))).toBe(true);
    expect(solidTouchesSegment(sphere, ...body(500, 500, 101))).toBe(false);
    expect(solidTouchesSegment(sphere, ...body(599, 500, 0))).toBe(true);
    expect(solidTouchesSegment(sphere, ...body(580, 580, 0))).toBe(false);
    expect(solidTouchesSegment(sphere, ...body(570, 570, -200, 400))).toBe(true);
  });

  it('takes a piece in on a beam only where its body crosses the bar', () => {
    const level = solid({ kind: 'beam', type: 'LINE', length: 4, width: 1, originZ: 25 });
    expect(solidTouchesSegment(level, ...body(650, 500, 0))).toBe(true);
    expect(solidTouchesSegment(level, ...body(650, 530, 0))).toBe(false);
    expect(solidTouchesSegment(level, ...body(650, 500, 51))).toBe(false);
    expect(solidTouchesSegment(level, ...body(480, 500, 0))).toBe(false);
    const steep = solid({ kind: 'beam', type: 'LINE', length: 4, width: 1, originZ: 25, pitch: 45 });
    expect(solidTouchesSegment(steep, ...body(600, 500, 0))).toBe(false);
    expect(solidTouchesSegment(steep, ...body(600, 500, 100))).toBe(true);
  });

  it('takes a piece in on a cone only within its opening, from its tip to its end', () => {
    const cone = solid({ kind: 'cone', type: 'CORN', length: 4, width: 4, originZ: 25 });
    expect(solidTouchesSegment(cone, ...body(690, 500, 0))).toBe(true);
    expect(solidTouchesSegment(cone, ...body(690, 600, 0))).toBe(false);
    expect(solidTouchesSegment(cone, ...body(690, 590, 0))).toBe(true);
    expect(solidTouchesSegment(cone, ...body(710, 500, 0))).toBe(false);
    expect(solidTouchesSegment(cone, ...body(490, 500, 0))).toBe(false);
    expect(solidTouchesSegment(cone, ...body(560, 500, 70))).toBe(false);
  });

  it('points a cone up at a piece in the air over the table', () => {
    const upwards = solid({ kind: 'cone', type: 'CORN', length: 6, width: 2, originZ: 25, pitch: 45 });
    expect(solidTouchesSegment(upwards, ...body(700, 500, 200))).toBe(true);
    expect(solidTouchesSegment(upwards, ...body(700, 500, 0))).toBe(false);
  });
});

describe('solidEntryAlong', () => {
  const down = (x: number, y: number): [Vec3, Vec3] => [
    { x, y, z: 1000 },
    { x, y, z: -1000 },
  ];

  it('finds where a line looking straight down first meets each solid', () => {
    expect(solidEntryAlong(solid({ kind: 'sphere', length: 2, originZ: 0 }), ...down(500, 500))).toBeCloseTo(0.45);
    expect(solidEntryAlong(solid({ height: 2, originZ: 0 }), ...down(500, 500))).toBeCloseTo(0.45);
    expect(solidEntryAlong(solid({ type: 'SQUARE', height: 2, originZ: 0 }), ...down(540, 540))).toBeCloseTo(0.45);
    expect(
      solidEntryAlong(solid({ kind: 'beam', type: 'LINE', length: 4, width: 2, originZ: 0 }), ...down(600, 500))
    ).toBeCloseTo(0.475);
    expect(
      solidEntryAlong(solid({ kind: 'cone', type: 'CORN', length: 4, width: 4, originZ: 0 }), ...down(600, 500))
    ).toBeCloseTo(0.475, 4);
  });

  it('misses a solid the line passes by', () => {
    expect(solidEntryAlong(solid({ kind: 'sphere', length: 2 }), ...down(700, 500))).toBeNull();
    expect(solidEntryAlong(solid({ height: 2 }), ...down(700, 500))).toBeNull();
    expect(solidEntryAlong(solid({ kind: 'cone', type: 'CORN', length: 4, width: 4 }), ...down(480, 500))).toBeNull();
    expect(solidEntryAlong(solid({ kind: 'beam', type: 'LINE', length: 4, width: 1 }), ...down(600, 540))).toBeNull();
  });

  it('meets a solid at once where the line starts within it', () => {
    const inside: [Vec3, Vec3] = [
      { x: 500, y: 500, z: 10 },
      { x: 900, y: 500, z: 10 },
    ];
    expect(solidEntryAlong(solid({ kind: 'sphere', length: 2 }), ...inside)).toBe(0);
    expect(solidEntryAlong(solid({ height: 2 }), ...inside)).toBe(0);
  });

  it('agrees with whether the line touches the solid at all, for every kind', () => {
    const random = seeded(23);
    const kinds: Partial<SolidInput>[] = [
      { kind: 'sphere', type: 'CIRCLE' },
      { kind: 'column', type: 'HEXAGON' },
      { kind: 'column', type: 'CIRCLE' },
      { kind: 'cone', type: 'CORN', width: 3 },
      { kind: 'beam', type: 'LINE', width: 1 },
    ];
    for (const kind of kinds) {
      for (let i = 0; i < 200; i++) {
        const shaped = solid({ ...kind, length: 2 + random() * 3, rotate: random() * 360, pitch: random() * 120 - 60 });
        const from = { x: 500 + (random() - 0.5) * 800, y: 500 + (random() - 0.5) * 800, z: random() * 600 };
        const to = { x: 500 + (random() - 0.5) * 800, y: 500 + (random() - 0.5) * 800, z: random() * -300 };
        const entry = solidEntryAlong(shaped, from, to);
        expect(entry !== null, `agree ${shaped.kind} ${i} ${entry}`).toBe(solidTouchesSegment(shaped, from, to));
        if (entry === null) continue;
        const at = {
          x: from.x + (to.x - from.x) * entry,
          y: from.y + (to.y - from.y) * entry,
          z: from.z + (to.z - from.z) * entry,
        };
        expect(solidTouchesSegment(shaped, at, at), `at ${shaped.kind} ${i} ${entry}`).toBe(true);
      }
    }
  });
});
