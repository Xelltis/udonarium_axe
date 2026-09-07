import {
  MULTI_ANGLE_SEATS,
  multiAngleDegreesFromPoint,
  multiAngleNameMotionMode,
  multiAngleOrbitAnimation,
  multiAnglePieceMotionMode,
  multiAngleRotationPhase,
  normalizeDegrees,
} from '@axe/domain/tabletop/multi-angle';

describe('multi-angle geometry', () => {
  it('defines the four seats clockwise from the bottom edge', () => {
    expect(MULTI_ANGLE_SEATS.map((seat) => [seat.key, seat.degrees])).toEqual([
      ['down', 0],
      ['left', 90],
      ['up', 180],
      ['right', 270],
    ]);
  });

  it('normalizes positive and negative turns', () => {
    expect(normalizeDegrees(450)).toBe(90);
    expect(normalizeDegrees(-90)).toBe(270);
  });

  it.each([
    { point: [50, 90], expected: 0 },
    { point: [10, 50], expected: 90 },
    { point: [50, 10], expected: 180 },
    { point: [90, 50], expected: 270 },
  ])('maps $point into the $expected degree hover area', ({ point, expected }) => {
    expect(multiAngleDegreesFromPoint(point[0], point[1], 50, 50)).toBe(expected);
  });

  it('uses diagonal boundaries to make four equal 90-degree areas', () => {
    expect(multiAngleDegreesFromPoint(70, 71, 50, 50)).toBe(0);
    expect(multiAngleDegreesFromPoint(71, 70, 50, 50)).toBe(270);
  });

  it.each([
    { mode: 'continuous' as const, name: 'continuous', piece: 'continuous' },
    { mode: 'quarter-turn' as const, name: 'quarter-turn', piece: 'quarter-turn' },
    { mode: 'piece-quarter-turn' as const, name: 'continuous', piece: 'quarter-turn' },
  ])('maps $mode to $name name motion and $piece piece motion', ({ mode, name, piece }) => {
    expect(multiAngleNameMotionMode(mode)).toBe(name);
    expect(multiAnglePieceMotionMode(mode)).toBe(piece);
  });

  it('runs a continuous revolution in the configured number of seconds', () => {
    expect(multiAngleOrbitAnimation('continuous', 18, 4)).toEqual({
      durationSeconds: 18,
      timingFunction: 'linear',
    });
  });

  it('rotates each quarter smoothly and then holds it for the configured interval', () => {
    expect(multiAngleOrbitAnimation('quarter-turn', 8, 2)).toEqual({
      durationSeconds: 16,
      timingFunction: 'linear(0 0%, 0.25 12.5%, 0.25 25%, 0.5 37.5%, 0.5 50%, 0.75 62.5%, 0.75 75%, 1 87.5%, 1 100%)',
    });
  });

  it('clamps unsafe timing settings', () => {
    expect(multiAngleOrbitAnimation('continuous', 0, 0).durationSeconds).toBe(1);
    expect(multiAngleOrbitAnimation('quarter-turn', Number.NaN, 99).durationSeconds).toBe(132);
  });

  it('gives each piece a stable pseudo-random starting phase', () => {
    const first = multiAngleRotationPhase('piece-a');

    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);
    expect(multiAngleRotationPhase('piece-a')).toBe(first);
    expect(multiAngleRotationPhase('piece-b')).not.toBe(first);
  });
});
