import {
  BACKDROP_MAX_RISE_PX,
  BACKDROP_PAN_RATIO,
  BACKDROP_REST_TILT_DEGREES,
  BACKDROP_TILT_PX_PER_DEGREE,
  BackdropCamera,
  backdropOffset,
} from '@axe/domain/tabletop/backdrop-offset';

const AT_REST: BackdropCamera = { rotateX: BACKDROP_REST_TILT_DEGREES, rotateZ: 0, positionX: 0, positionY: 0 };

function camera(changes: Partial<BackdropCamera>): BackdropCamera {
  return { ...AT_REST, ...changes };
}

describe('backdropOffset()', () => {
  it('leaves a backdrop where it was put while the view stands where it starts', () => {
    const offset = backdropOffset(AT_REST, 1, 800);

    expect(offset.y).toBe(0);
    expect(offset.x === 0 || offset.x === -800).toBe(true);
  });

  it('never moves a backdrop that does not follow the camera', () => {
    expect(backdropOffset(camera({ rotateZ: 90, rotateX: 80, positionX: 500, positionY: 300 }), 0, 800)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('goes a quarter of the way round the picture for a quarter turn, followed fully', () => {
    expect(backdropOffset(camera({ rotateZ: 90 }), 1, 800).x).toBe(-200);
  });

  it('goes round less when it follows less, which is what makes it look further away', () => {
    const near = backdropOffset(camera({ rotateZ: 45 }), 0.6, 800).x;
    const far = backdropOffset(camera({ rotateZ: 45 }), 0.1, 800).x;

    expect(Math.abs(far)).toBeLessThan(Math.abs(near));
  });

  it('comes back to where it was after a whole turn, the picture being laid edge to edge', () => {
    const before = backdropOffset(camera({ rotateZ: 30 }), 1, 800).x;
    const after = backdropOffset(camera({ rotateZ: 390 }), 1, 800).x;

    expect(after).toBeCloseTo(before);
  });

  it('keeps every shift across within one picture before the start, so no seam shows', () => {
    for (const rotateZ of [-720, -91, -1, 0, 1, 91, 359, 1000]) {
      const { x } = backdropOffset(camera({ rotateZ, positionX: 1234 }), 0.7, 640);
      expect(x).toBeGreaterThanOrEqual(-640);
      expect(x).toBeLessThanOrEqual(0);
    }
  });

  it('drags a little the way the view is moved', () => {
    const { y } = backdropOffset(camera({ positionY: 100 }), 1, 800);

    expect(y).toBeCloseTo(100 * BACKDROP_PAN_RATIO);
  });

  it('rises or falls as the view tilts, and never past its reach', () => {
    expect(backdropOffset(camera({ rotateX: BACKDROP_REST_TILT_DEGREES + 10 }), 1, 800).y).toBeCloseTo(
      10 * BACKDROP_TILT_PX_PER_DEGREE
    );
    expect(backdropOffset(camera({ rotateX: 1000 }), 1, 800).y).toBe(BACKDROP_MAX_RISE_PX);
    expect(backdropOffset(camera({ rotateX: -1000 }), 0.5, 800).y).toBe(-BACKDROP_MAX_RISE_PX * 0.5);
  });

  it('does not fall over on a picture not measured yet, or a camera with nonsense in it', () => {
    expect(backdropOffset(camera({ rotateZ: 90 }), 1, 0).x).toBe(0);
    expect(
      backdropOffset(camera({ rotateZ: Number.NaN, positionX: Number.POSITIVE_INFINITY }), 1, 800).x
    ).not.toBeNaN();
  });
});
