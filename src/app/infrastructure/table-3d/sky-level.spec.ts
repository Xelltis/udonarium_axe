import { skyLevelTurn, skyPitchFor } from '@axe/infrastructure/table-3d/sky-level';
import { Matrix3, Vector3 } from 'three/webgpu';

const DEG = Math.PI / 180;
const HALF_VIEW = 8 * DEG;

/** The way a camera at a pitch and a heading looks, with its sideways axis. */
function cameraAt(pitch: number, heading: number) {
  const forward = new Vector3(
    Math.sin(heading) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(heading) * Math.cos(pitch)
  );
  const sideways = new Vector3(Math.cos(heading), 0, Math.sin(heading));
  return { forward, sideways };
}

describe('the sky turned for the way the camera looks', () => {
  it('stands where it is for a camera looking at or over the horizon', () => {
    expect(skyPitchFor(0, HALF_VIEW)).toBe(0);
    expect(skyPitchFor(10 * DEG, HALF_VIEW)).toBe(10 * DEG);
  });

  it('is drawn as seen looking a little up for a table looked steeply down on, the horizon low in the view', () => {
    const level = skyPitchFor(-60 * DEG, HALF_VIEW);

    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThan(HALF_VIEW);
    expect(skyPitchFor(-90 * DEG, HALF_VIEW)).toBeCloseTo(level, 10);
  });

  it('moves from where it is to level without a jump as the camera looks further down', () => {
    let last = skyPitchFor(0, HALF_VIEW);
    for (let degrees = 1; degrees <= 30; degrees++) {
      const next = skyPitchFor(-degrees * DEG, HALF_VIEW);
      expect(Math.abs(next - last)).toBeLessThan(2 * DEG);
      last = next;
    }
  });

  it('turns the way the camera looks to the pitch the sky is drawn at, whichever way it faces', () => {
    for (const heading of [0, 1, 2.5, -2]) {
      const { forward, sideways } = cameraAt(-55 * DEG, heading);
      const turned = forward.clone().applyMatrix3(skyLevelTurn(forward, sideways, HALF_VIEW, new Matrix3()));

      expect(Math.asin(turned.y)).toBeCloseTo(skyPitchFor(-55 * DEG, HALF_VIEW), 6);
      expect(Math.atan2(turned.x, -turned.z)).toBeCloseTo(heading, 6);
    }
  });

  it('turns the sky for a camera looking straight down, and not at all for one turned on its side', () => {
    const down = skyLevelTurn(new Vector3(0, -1, 0), new Vector3(1, 0, 0), HALF_VIEW, new Matrix3());
    expect(Math.asin(new Vector3(0, -1, 0).applyMatrix3(down).y)).toBeCloseTo(skyPitchFor(-Math.PI / 2, HALF_VIEW), 6);

    const onSide = skyLevelTurn(new Vector3(0, -0.5, -0.8).normalize(), new Vector3(0, 1, 0), HALF_VIEW, new Matrix3());
    expect(onSide.equals(new Matrix3())).toBe(true);
  });
});
