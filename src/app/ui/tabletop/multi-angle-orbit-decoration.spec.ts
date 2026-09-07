import { PieceGauge } from '@axe/domain/character/piece-gauge';
import {
  makeMultiAngleBuffOrbit,
  makeMultiAngleResourceGauge,
  MAX_MULTI_ANGLE_RESOURCE_GAUGES,
} from '@axe/ui/tabletop/multi-angle-orbit-decoration';

function gauge(index: number, ratio = 1): PieceGauge {
  return {
    identifier: `gauge-${index}`,
    name: `Resource ${index}`,
    initial: `R${index}`,
    current: ratio * 10,
    max: 10,
    ratio,
    inverted: false,
    color: '#00ff00',
  };
}

describe('multi-angle orbit decoration', () => {
  it.each([
    { count: 1, degrees: 360 },
    { count: 2, degrees: 180 },
    { count: 3, degrees: 120 },
    { count: 4, degrees: 90 },
  ])('gives $count resources $degrees degrees each', ({ count, degrees }) => {
    const layout = makeMultiAngleResourceGauge(
      Array.from({ length: count }, (_, index) => gauge(index)),
      50
    );

    expect(layout.segments).toHaveLength(count);
    expect(layout.segments.every((segment) => segment.segmentDegrees === degrees)).toBe(true);
  });

  it('uses only the first four configured resources', () => {
    const layout = makeMultiAngleResourceGauge(
      Array.from({ length: 6 }, (_, index) => gauge(index)),
      50
    );

    expect(layout.segments).toHaveLength(MAX_MULTI_ANGLE_RESOURCE_GAUGES);
    expect(layout.segments.map((segment) => segment.gauge.identifier)).toEqual([
      'gauge-0',
      'gauge-1',
      'gauge-2',
      'gauge-3',
    ]);
  });

  it.each([
    { count: 1, angles: [] },
    { count: 2, angles: [-90, 90] },
    { count: 3, angles: [-90, 30, 150] },
    { count: 4, angles: [-90, 0, 90, 180] },
  ])('draws black boundaries only when $count resources share the ring', ({ count, angles }) => {
    const layout = makeMultiAngleResourceGauge(
      Array.from({ length: count }, (_, index) => gauge(index)),
      50
    );

    expect(layout.separators.map((separator) => separator.angleDegrees)).toEqual(angles);
    expect(layout.separators.every((separator) => separator.x1 !== separator.x2 || separator.y1 !== separator.y2)).toBe(
      true
    );
  });

  it('fills only the resource ratio inside its assigned segment', () => {
    const layout = makeMultiAngleResourceGauge([gauge(0, 0.5), gauge(1, 0.25)], 50);

    expect(layout.segments[0]?.trackDashArray).toBe('180 180');
    expect(layout.segments[0]?.fillDashArray).toBe('90 270');
    expect(layout.segments[1]?.fillDashArray).toBe('45 315');
  });

  it('spaces every buff evenly and expands a crowded orbit', () => {
    const compact = makeMultiAngleBuffOrbit(4, 50, 42);
    const crowded = makeMultiAngleBuffOrbit(24, 50, 42);

    expect(compact.angles).toEqual([0, 90, 180, 270]);
    expect(crowded.angles).toHaveLength(24);
    expect(crowded.radius).toBeGreaterThan(compact.radius);
  });
});
