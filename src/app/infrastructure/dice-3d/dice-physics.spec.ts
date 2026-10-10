import { upFace } from '@axe/domain/dice/dice-3d/die-symmetry';
import { DIE_SHAPES, dieRadiusOf, DieShape, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { cross, dot, Quat, quatMultiply, quatRotate, UP, Vec3 } from '@axe/domain/dice/dice-3d/rotation';
import { FRAME_TRAY_AREA, frameAspectFor, trayFor } from '@axe/domain/dice/dice-3d/tray-size';
import { faceFramesOf } from '@axe/infrastructure/dice-3d/dice-geometry';
import { simulateThrow, spoilOf } from '@axe/infrastructure/dice-3d/dice-physics';
import { DiceThrowRequest, DiceThrowResult, FRAME_STRIDE } from '@axe/infrastructure/dice-3d/dice-physics-message';

function lastRotation(result: DiceThrowResult, die: number, count: number): Quat {
  const at = ((result.frameCount - 1) * count + die) * FRAME_STRIDE;
  return [result.frames[at + 3], result.frames[at + 4], result.frames[at + 5], result.frames[at + 6]];
}

function lastPosition(result: DiceThrowResult, die: number, count: number): [number, number, number] {
  const at = ((result.frameCount - 1) * count + die) * FRAME_STRIDE;
  return [result.frames[at], result.frames[at + 1], result.frames[at + 2]];
}

const away: Vec3 = [0, 1, 0];

/** How deep a die's corner may go into the felt unseen: a fifth of a die, lost in its shadow. */
const UNSEEN_SINK = 0.4;

/** How far below the floor the lowest corner of any die is drawn in any frame of a throw. */
function deepestSinkOf(result: DiceThrowResult, shapes: readonly DieShape[]): number {
  let deepest = 0;
  for (let frame = 0; frame < result.frameCount; frame++) {
    shapes.forEach((shape, die) => {
      const at = (frame * shapes.length + die) * FRAME_STRIDE;
      const rotation: Quat = [
        result.frames[at + 3],
        result.frames[at + 4],
        result.frames[at + 5],
        result.frames[at + 6],
      ];
      const radius = dieRadiusOf(shape);
      for (const corner of polyhedronOf(shape).vertices) {
        deepest = Math.max(deepest, -(result.frames[at + 2] + quatRotate(rotation, corner)[2] * radius));
      }
    });
  }
  return deepest;
}

function requestFor(key: string, shapes: DieShape[], extra: Partial<DiceThrowRequest> = {}): DiceThrowRequest {
  return { key, shapes, targets: shapes.map(() => 0), tray: trayFor(3, 2), edge: 'left', away, ...extra };
}

describe('simulateThrow', () => {
  const tray = trayFor(3, 2);

  it('throws the same way every time for the same roll', () => {
    const request = requestFor('same-roll', ['d20', 'd6']);
    const a = simulateThrow(request);
    const b = simulateThrow(request);
    expect(b.frameCount).toBe(a.frameCount);
    expect(Array.from(b.frames)).toEqual(Array.from(a.frames));
    expect(b.landed).toEqual(a.landed);
  });

  it('throws another roll another way', () => {
    const a = simulateThrow(requestFor('roll-a', ['d20']));
    const b = simulateThrow(requestFor('roll-b', ['d20']));
    expect(Array.from(b.frames.slice(0, 70))).not.toEqual(Array.from(a.frames.slice(0, 70)));
  });

  for (const shape of DIE_SHAPES) {
    it(`lands a ${shape} cleanly in the tray and brings it round to the number it has to show`, () => {
      const poly = polyhedronOf(shape);
      const count = poly.readsCorners ? poly.vertices.length : poly.faces.length;
      for (let seed = 0; seed < 4; seed++) {
        const shapes = [shape, shape];
        const targets = [seed % count, (seed * 3 + 1) % count];
        const edge = seed % 2 ? 'right' : 'left';
        const result = simulateThrow(requestFor(`${shape}-${seed}`, shapes, { targets, edge }));

        expect(result.fault).toBeNull();
        expect(result.restFrame).toBeLessThan(result.frameCount);
        shapes.forEach((_, die) => {
          const rest = lastRotation(result, die, shapes.length);
          const [x, y] = lastPosition(result, die, shapes.length);
          expect(Math.abs(x)).toBeLessThan(tray.halfWidth);
          expect(Math.abs(y)).toBeLessThan(tray.halfDepth);
          expect(upFace(poly, rest)).toBe(result.landed[die]);
          expect(upFace(poly, quatMultiply(rest, result.corrections[die]))).toBe(targets[die]);
        });
      }
    });
  }

  it('lands twenty dice apart, given the room the tray gives so many', () => {
    const shapes = Array<DieShape>(20).fill('d6');
    const result = simulateThrow(requestFor('twenty', shapes, { tray: trayFor(20, 2), edge: 'near' }));

    expect(result.fault).toBeNull();
    expect(result.landed).toHaveLength(20);
  });

  it('brings a crowd of round dice to rest in the tray within four seconds, tiring them the longer they go on', () => {
    const shapes = Array.from({ length: 20 }, (_, i): DieShape => (['d6', 'd10', 'd20', 'd8'] as DieShape[])[i % 4]);
    const tray = trayFor(20, frameAspectFor(20), FRAME_TRAY_AREA);
    for (const key of ['crowd-a', 'crowd-b', 'crowd-c', 'crowd-d']) {
      const result = simulateThrow(requestFor(key, shapes, { tray }));

      // A heap's dice may lean on one another, as real ones do; they may not leave the tray or keep moving.
      expect([null, 'cocked', 'stacked']).toContain(result.fault);
      expect(result.restFrame).toBeLessThan(4 * 60);
    }
  });

  it('works the dice out finely enough as they fly in and land that none is seen to sink into the floor', () => {
    const shapes: DieShape[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
    const tray = trayFor(shapes.length, frameAspectFor(shapes.length), FRAME_TRAY_AREA);
    for (const key of ['sink-a', 'sink-b', 'sink-c']) {
      const result = simulateThrow(requestFor(key, shapes, { tray }));

      expect(deepestSinkOf(result, shapes)).toBeLessThan(UNSEEN_SINK);
    }
  });

  it('brings fifty dice to rest in the tray', () => {
    const shapes = Array<DieShape>(50).fill('d6');
    const result = simulateThrow(
      requestFor('fifty', shapes, { tray: trayFor(50, frameAspectFor(50), FRAME_TRAY_AREA) })
    );

    expect([null, 'cocked', 'stacked']).toContain(result.fault);
    expect(result.landed).toHaveLength(50);
  });

  it('counts a number left upside down against a throw of a few dice, and never above a fault', () => {
    expect(spoilOf(null, 0, 2)).toBe(0);
    expect(spoilOf(null, 1, 2)).toBeGreaterThan(0);
    expect(spoilOf(null, 2, 2)).toBeLessThan(spoilOf('cocked', 0, 2));
    expect(spoilOf('outside', 0, 2)).toBeGreaterThan(spoilOf('cocked', 0, 2));
  });

  it('does not count a number upside down against a large roll, which one of so many always leaves', () => {
    expect(spoilOf(null, 3, 10)).toBe(0);
  });

  it('lets the dice of a large roll lean on one another as a heap of real dice does, but not leave the tray', () => {
    expect(spoilOf('stacked', 0, 20)).toBe(0);
    expect(spoilOf('cocked', 0, 20)).toBe(0);
    expect(spoilOf('outside', 0, 20)).toBeGreaterThan(0);
    expect(spoilOf('unsettled', 0, 20)).toBeGreaterThan(0);
    expect(spoilOf('stacked', 0, 4)).toBeGreaterThan(0);
  });

  it('records seven numbers for every die in every frame', () => {
    const result = simulateThrow(requestFor('stride', ['d8', 'd12', 'd4'], { edge: 'near' }));

    expect(result.frames).toHaveLength(result.frameCount * 3 * FRAME_STRIDE);
    expect(Array.from(result.frames).every(Number.isFinite)).toBe(true);
  });

  it('throws a pair of d10 again rather than leave a number upside down to the viewer', () => {
    const tray = trayFor(2, 400 / 120);
    let upsideDown = 0;
    for (let seed = 0; seed < 12; seed++) {
      const targets = [seed % 10, (seed * 7) % 10];
      const result = simulateThrow(requestFor(`d100-${seed}`, ['d10', 'd10'], { targets, tray }));
      [0, 1].forEach((die) => {
        const turned = quatMultiply(lastRotation(result, die, 2), result.corrections[die]);
        const up = quatRotate(turned, faceFramesOf('d10')[targets[die]].up);
        const across: Vec3 = [up[0], up[1], 0];
        if (Math.abs(Math.atan2(dot(cross(away, across), UP), dot(away, across))) > Math.PI / 2) upsideDown++;
      });
    }
    expect(upsideDown).toBe(0);
  });
});
