import {
  cameraOf,
  homeward,
  isAtRest,
  LOOK_PITCH_LIMIT_DEG,
  LOOK_REST,
  lookDragged,
  lookEased,
} from '@axe/domain/tabletop/first-person/first-person-look';

describe('looking about from a piece', () => {
  const pose = { x: 100, y: 200, z: 25, yaw: 90 };

  it('turns and tips the camera without moving the eye', () => {
    expect(cameraOf(pose, { yaw: 30, pitch: -20 })).toEqual({ x: 100, y: 200, z: 25, yaw: 120, pitch: -20 });
    expect(cameraOf(pose, LOOK_REST)).toEqual({ ...pose, pitch: 0 });
  });

  it('turns towards where the pointer goes and looks up as it goes up the screen', () => {
    const look = lookDragged(LOOK_REST, 100, -50, 0.1);

    expect(look.yaw).toBeCloseTo(10);
    expect(look.pitch).toBeCloseTo(5);
  });

  it('looks no further up or down than the limit', () => {
    expect(lookDragged(LOOK_REST, 0, -5000, 0.1).pitch).toBe(LOOK_PITCH_LIMIT_DEG);
    expect(lookDragged(LOOK_REST, 0, 5000, 0.1).pitch).toBe(-LOOK_PITCH_LIMIT_DEG);
  });

  it('goes back the short way round', () => {
    expect(homeward({ yaw: 270, pitch: 10 })).toEqual({ yaw: -90, pitch: 10 });
    expect(homeward({ yaw: -200, pitch: 0 }).yaw).toBe(160);
    expect(Math.abs(homeward({ yaw: 180, pitch: 0 }).yaw)).toBe(180);
  });

  it('eases back to rest, arriving there at the end', () => {
    const from = { yaw: 60, pitch: -30 };

    expect(lookEased(from, 0)).toEqual(from);
    expect(Math.abs(lookEased(from, 0.5).yaw)).toBeLessThan(60);
    expect(isAtRest(lookEased(from, 1))).toBe(true);
  });
});
