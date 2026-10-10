import { rotationGroupOf, upFace } from '@axe/domain/dice/dice-3d/die-symmetry';
import { DIE_SHAPES, DieShape, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { restingRotation } from '@axe/domain/dice/dice-3d/resting-pose';
import { cross, dot, Quat, quatMultiply, quatRotate, UP, Vec3 } from '@axe/domain/dice/dice-3d/rotation';
import { faceFramesOf } from '@axe/infrastructure/dice-3d/dice-geometry';
import { DiceThrowResult, FRAME_STRIDE } from '@axe/infrastructure/dice-3d/dice-physics-message';
import { faceTheReader } from '@axe/infrastructure/dice-3d/reader-facing';

const away: Vec3 = [0, 1, 0];
const tray = { halfWidth: 8, halfDepth: 4 };

interface Resting {
  readonly at: Vec3;
  readonly rotation: Quat;
}

/** A recording of dice that roll over a little and come to rest. */
function recordingOf(dice: readonly Resting[], frameCount = 40): DiceThrowResult {
  const frames = new Float32Array(frameCount * dice.length * FRAME_STRIDE);
  for (let frame = 0; frame < frameCount; frame++) {
    dice.forEach((die, index) => {
      const at = (frame * dice.length + index) * FRAME_STRIDE;
      frames.set([die.at[0] - (frameCount - 1 - frame) * 0.05, die.at[1], die.at[2]], at);
      frames.set(die.rotation, at + 3);
    });
  }
  return { frameCount, restFrame: frameCount - 10, frames, landed: [], corrections: [], attempt: 0, fault: null };
}

function restAt(frames: Float32Array, at: number): Quat {
  return [frames[at + 3], frames[at + 4], frames[at + 5], frames[at + 6]];
}

function restOf(frames: Float32Array, die: number, count: number): Quat {
  const at = ((frames.length / (count * FRAME_STRIDE) - 1) * count + die) * FRAME_STRIDE + 3;
  return [frames[at], frames[at + 1], frames[at + 2], frames[at + 3]];
}

/** How far round from upright the number on top reads, from 0 to π. */
function leanOf(shape: DieShape, rest: Quat, correction: Quat, target: number): number {
  const up = quatRotate(quatMultiply(rest, correction), faceFramesOf(shape)[target].up);
  const across: Vec3 = [up[0], up[1], 0];
  return Math.abs(Math.atan2(dot(cross(away, across), UP), dot(away, across)));
}

function countOf(shape: DieShape): number {
  const poly = polyhedronOf(shape);
  return poly.readsCorners ? poly.vertices.length : poly.faces.length;
}

describe('faceTheReader', () => {
  for (const shape of DIE_SHAPES) {
    it(`still shows the number asked for on a ${shape}`, () => {
      const poly = polyhedronOf(shape);
      for (let landed = 0; landed < countOf(shape); landed++) {
        const rotation = restingRotation(shape, landed, 0.9 * landed);
        const result = recordingOf([{ at: [0, 0, 1], rotation }]);
        for (let target = 0; target < countOf(shape); target++) {
          const faced = faceTheReader([shape], [landed], [target], result, tray, away);
          const rest = restOf(faced.frames, 0, 1);
          expect(upFace(poly, quatMultiply(rest, faced.corrections[0]))).toBe(target);
        }
      }
    });
  }

  for (const shape of DIE_SHAPES.filter((s) => s !== 'd4' && s !== 'd10')) {
    it(`picks the turn that sets the number on top of a ${shape} as near upright as its faces allow`, () => {
      const poly = polyhedronOf(shape);
      // The worst a number can lean is half the turn between the ways its face can sit.
      const worst = Math.PI / (rotationGroupOf(shape).length / poly.faces.length) + 1e-9;
      for (const yaw of [0, 0.7, 1.9, 3.1, 4.4]) {
        const rotation = restingRotation(shape, 0, yaw);
        const result = recordingOf([{ at: [0, 0, 1], rotation }]);
        for (const target of [0, poly.faces.length - 1]) {
          const faced = faceTheReader([shape], [0], [target], result, tray, away);
          expect(faced.frames).toBe(result.frames);
          expect(leanOf(shape, rotation, faced.corrections[0], target)).toBeLessThanOrEqual(worst);
        }
      }
    });
  }

  it('twists a d10 that would come to rest upside down round as it rolls, leaving it a little askew', () => {
    for (const yaw of [0, 1.1, 2.3, 3.4, 4.6, 5.7]) {
      const rotation = restingRotation('d10', 0, yaw);
      const result = recordingOf([{ at: [0, 0, 1], rotation }]);
      for (let target = 0; target < 10; target++) {
        const faced = faceTheReader(['d10'], [0], [target], result, tray, away);
        const rest = restOf(faced.frames, 0, 1);
        expect(leanOf('d10', rest, faced.corrections[0], target)).toBeLessThan(Math.PI / 2);
      }
    }
  });

  it('only turns a die about the upright through its middle, so it moves and sits on the floor just as it did', () => {
    const poly = polyhedronOf('d10');
    const rotation = restingRotation('d10', 3, 0);
    const result = recordingOf([{ at: [0, 0, 1], rotation }]);
    const target = [...Array(10).keys()].find(
      (t) => faceTheReader(['d10'], [3], [t], result, tray, away).frames !== result.frames
    )!;
    const faced = faceTheReader(['d10'], [3], [target], result, tray, away);

    for (let frame = 0; frame < result.frameCount; frame++) {
      const at = frame * FRAME_STRIDE;
      expect(Array.from(faced.frames.slice(at, at + 3))).toEqual(Array.from(result.frames.slice(at, at + 3)));
      const before = restAt(result.frames, at);
      const after = restAt(faced.frames, at);
      const heights = (q: Quat) => poly.vertices.map((v) => quatRotate(q, v)[2]).sort((a, b) => a - b);
      heights(after).forEach((h, i) => expect(h).toBeCloseTo(heights(before)[i], 5));
    }
    expect(upFace(poly, restOf(faced.frames, 0, 1))).toBe(3);
  });

  it('twists a d10 resting near another die when it can turn without brushing it', () => {
    const rotation = restingRotation('d10', 0, 0);
    const near = recordingOf([
      { at: [0, 0, 1], rotation },
      { at: [2.3, 0, 1], rotation },
    ]);
    const twisted = [...Array(10).keys()].filter(
      (target) => faceTheReader(['d10', 'd10'], [0, 0], [target, 0], near, tray, away).frames !== near.frames
    );
    expect(twisted.length).toBeGreaterThan(0);
  });

  it('leaves a d10 resting against another die or a wall as it lies', () => {
    const rotation = restingRotation('d10', 0, 0);
    const together = recordingOf([
      { at: [0, 0, 1], rotation },
      { at: [1.6, 0, 1], rotation },
    ]);
    const byTheWall = recordingOf([{ at: [tray.halfWidth - 1, 0, 1], rotation }]);
    for (let target = 0; target < 10; target++) {
      expect(faceTheReader(['d10', 'd10'], [0, 0], [target, target], together, tray, away).frames).toBe(
        together.frames
      );
      expect(faceTheReader(['d10'], [0], [target], byTheWall, tray, away).frames).toBe(byTheWall.frames);
    }
  });
});
