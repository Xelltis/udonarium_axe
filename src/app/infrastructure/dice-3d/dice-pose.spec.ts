import { ACCENT_SECONDS, type DiceThrowResult } from '@axe/infrastructure/dice-3d/dice-physics-message';
import {
  CONTACT_FADE_HEIGHT,
  CONTACT_LIFT,
  CONTACT_OPACITY,
  CONTACT_SPREAD,
  HALO_SPREAD,
  type PosedThrow,
  poseThrow,
} from '@axe/infrastructure/dice-3d/dice-pose';
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';

const HALF_TURN_Z = Math.SQRT1_2;

/** A recording of one die over two frames: still at a unit's height, then moved and turned a quarter about z. */
function recording(): DiceThrowResult {
  return {
    frameCount: 2,
    restFrame: 1,
    frames: new Float32Array([0, 0, 1, 0, 0, 0, 1, 2, 4, 3, 0, 0, HALF_TURN_Z, HALF_TURN_Z]),
    landed: [0],
    corrections: [[0, 0, 0, 1]],
    attempt: 0,
    fault: null,
  };
}

function posedThrow(accented: boolean): PosedThrow {
  const patch = () => new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ transparent: true, opacity: 0 }));
  return {
    bodies: [new Group()],
    contacts: [patch()],
    halos: accented ? [patch()] : [],
    radii: [1.5],
    restHeights: [1],
    result: recording(),
    restSeconds: 1 / 60,
  };
}

describe('poseThrow', () => {
  it('sets a die between the two frames about the moment, its turn slerped between theirs', () => {
    const posed = posedThrow(false);

    poseThrow(posed, 0.5 / 60);

    const body = posed.bodies[0];
    expect(body.position.toArray()).toEqual([1, 2, 2]);
    expect(body.quaternion.toArray()).toEqual([
      0,
      0,
      expect.closeTo(Math.sin(Math.PI / 8), 6),
      expect.closeTo(Math.cos(Math.PI / 8), 6),
    ]);
  });

  it('holds the dice at the first frame before the throw and at the last after it', () => {
    const posed = posedThrow(false);

    poseThrow(posed, -1);
    expect(posed.bodies[0].position.toArray()).toEqual([0, 0, 1]);

    poseThrow(posed, 10);
    expect(posed.bodies[0].position.toArray()).toEqual([2, 4, 3]);
  });

  it('spreads and fades the patch under a die as it lifts off the floor', () => {
    const posed = posedThrow(false);

    poseThrow(posed, 0.5 / 60, 0.5);

    const contact = posed.contacts[0];
    expect(contact.position.toArray()).toEqual([1, 2, CONTACT_LIFT]);
    expect(contact.scale.x).toBeCloseTo(1.5 * CONTACT_SPREAD * (1 + 0.12), 9);
    expect(contact.material.opacity).toBeCloseTo(CONTACT_OPACITY * (1 - 1 / CONTACT_FADE_HEIGHT) * 0.5, 9);
  });

  it('swells a ring of light under the die as it stops, and lets it go again', () => {
    const posed = posedThrow(true);
    const halo = posed.halos[0];

    poseThrow(posed, 0);
    expect(halo.material.opacity).toBe(0);

    const since = 0.5;
    poseThrow(posed, posed.restSeconds + since * ACCENT_SECONDS);
    expect(halo.position.toArray()).toEqual([2, 4, CONTACT_LIFT * 2]);
    expect(halo.scale.x).toBeCloseTo(1.5 * HALO_SPREAD * (0.85 + 0.25 * since), 9);
    expect(halo.material.opacity).toBeCloseTo(Math.sin(Math.PI * since), 9);

    poseThrow(posed, posed.restSeconds + ACCENT_SECONDS * 2);
    expect(halo.material.opacity).toBe(0);
  });
});
