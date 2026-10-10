import { asDiceStage, showsInFrame, showsOnTable } from '@axe/domain/dice/dice-3d/dice-stage';
import { upFace } from '@axe/domain/dice/dice-3d/die-symmetry';
import { DIE_SHAPES, dieRadiusOf, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { restingLayout, restingRotation } from '@axe/domain/dice/dice-3d/resting-pose';
import { IDENTITY, quatFromAxisAngle } from '@axe/domain/dice/dice-3d/rotation';
import { throwSeedOf } from '@axe/domain/dice/dice-3d/throw-seed';
import { throwFaultOf, Tray } from '@axe/domain/dice/dice-3d/throw-validation';

const TRAY: Tray = { halfWidth: 6, halfDepth: 4 };

describe('throwSeedOf', () => {
  it('gives every peer the same seed for the same roll', () => {
    expect(throwSeedOf('message-abc')).toBe(throwSeedOf('message-abc'));
  });

  it('gives another roll, or another attempt at the same one, another seed', () => {
    expect(throwSeedOf('message-abc')).not.toBe(throwSeedOf('message-abd'));
    expect(throwSeedOf('message-abc', 1)).not.toBe(throwSeedOf('message-abc'));
  });

  it('never gives a seed of nothing', () => {
    for (let attempt = 0; attempt < 50; attempt++) expect(throwSeedOf('', attempt)).toBeGreaterThan(0);
  });
});

describe('asDiceStage', () => {
  it('reads the frame, the table and both as themselves', () => {
    expect(asDiceStage('frame')).toBe('frame');
    expect(asDiceStage('table')).toBe('table');
    expect(asDiceStage('both')).toBe('both');
  });

  it('shows the dice in the frame for the frame and for both, and on the table for the table and for both', () => {
    expect(['off', 'frame', 'table', 'both'].map((stage) => showsInFrame(asDiceStage(stage)))).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(['off', 'frame', 'table', 'both'].map((stage) => showsOnTable(asDiceStage(stage)))).toEqual([
      false,
      false,
      true,
      true,
    ]);
  });

  it('reads anything else as nowhere', () => {
    for (const raw of ['', 'off', undefined, null, 'sky', 1]) expect(asDiceStage(raw)).toBe('off');
  });
});

describe('throwFaultOf', () => {
  const flat = (z = polyhedronOf('d6').inradius * dieRadiusOf('d6')) =>
    ({ shape: 'd6', position: [0, 0, z], rotation: IDENTITY }) as const;

  it('passes dice resting flat in the tray', () => {
    expect(throwFaultOf([flat()], TRAY, true)).toBeNull();
  });

  it('throws again when the dice never settled', () => {
    expect(throwFaultOf([flat()], TRAY, false)).toBe('unsettled');
  });

  it('throws again when a die ended outside the tray', () => {
    expect(throwFaultOf([{ ...flat(), position: [7, 0, 0.9] }], TRAY, true)).toBe('outside');
  });

  it('throws again when a die came to rest on another', () => {
    expect(throwFaultOf([flat(), flat(2.5)], TRAY, true)).toBe('stacked');
  });

  it('throws again when a die leans without sitting flat', () => {
    const leaning = { ...flat(), rotation: quatFromAxisAngle([1, 0, 0], Math.PI / 7) };
    expect(throwFaultOf([leaning], TRAY, true)).toBe('cocked');
  });
});

describe('the resting dice of a screen with motion off', () => {
  it('show the faces the roll came to', () => {
    for (const shape of DIE_SHAPES) {
      const poly = polyhedronOf(shape);
      const count = poly.readsCorners ? poly.vertices.length : poly.faces.length;
      for (let target = 0; target < count; target++) {
        expect(upFace(poly, restingRotation(shape, target, 0.4))).toBe(target);
      }
    }
  });

  it('sit on the floor of the tray, inside it, without touching each other', () => {
    const dice = DIE_SHAPES.map((shape) => ({ shape, target: 0 }));
    const poses = restingLayout(dice, TRAY, 7);
    poses.forEach((pose, index) => {
      const shape = dice[index].shape;
      expect(pose.position[2]).toBeCloseTo(polyhedronOf(shape).inradius * dieRadiusOf(shape), 9);
      expect(Math.abs(pose.position[0])).toBeLessThan(TRAY.halfWidth);
      expect(Math.abs(pose.position[1])).toBeLessThan(TRAY.halfDepth);
      poses.forEach((other, j) => {
        if (j === index) return;
        const gap = Math.hypot(pose.position[0] - other.position[0], pose.position[1] - other.position[1]);
        expect(gap).toBeGreaterThan(dieRadiusOf(shape) + dieRadiusOf(dice[j].shape) - 0.2);
      });
    });
  });

  it('lay out the same way for the same roll', () => {
    const dice = [{ shape: 'd20' as const, target: 3 }];
    expect(restingLayout(dice, TRAY, 11)).toEqual(restingLayout(dice, TRAY, 11));
  });
});
