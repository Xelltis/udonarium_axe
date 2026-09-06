import {
  compensateMultiAngleDegrees,
  MULTI_ANGLE_SEATS,
  multiAngleDegreesFromPoint,
  multiAngleNameMotionMode,
  multiAngleOrbitAnimation,
  multiAnglePieceMotionMode,
  multiAngleRotationPhase,
  multiAngleSeatVector,
  normalizeDegrees,
} from '@axe/domain/tabletop/multi-angle';

describe('multi-angle geometry', () => {
  it('defines the four seats clockwise from the bottom edge', () => {
    expect(MULTI_ANGLE_SEATS).toEqual([
      { key: 'down', degrees: 0 },
      { key: 'left', degrees: 90 },
      { key: 'up', degrees: 180 },
      { key: 'right', degrees: 270 },
    ]);
  });

  it.each([
    { degrees: 0, expected: { x: 0, y: 1 } },
    { degrees: 90, expected: { x: -1, y: 0 } },
    { degrees: 180, expected: { x: 0, y: -1 } },
    { degrees: 270, expected: { x: 1, y: 0 } },
  ])('points $degrees degrees toward its table edge', ({ degrees, expected }) => {
    const actual = multiAngleSeatVector(degrees);
    expect(actual.x).toBeCloseTo(expected.x, 8);
    expect(actual.y).toBeCloseTo(expected.y, 8);
  });

  it('normalizes positive and negative turns', () => {
    expect(normalizeDegrees(450)).toBe(90);
    expect(normalizeDegrees(-90)).toBe(270);
  });

  it('subtracts the table rotation from a world-space label', () => {
    expect(compensateMultiAngleDegrees(0, 90)).toBe(270);
    expect(compensateMultiAngleDegrees(90, 270)).toBe(180);
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
