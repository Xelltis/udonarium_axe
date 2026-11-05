import {
  buildSegments,
  replayRouteMarksOf,
} from '@axe/features/replay/replay-route-overlay/replay-route-overlay.component';

const route = [
  { x: 0, y: 0, z: 0 },
  { x: 100, y: 0, z: 0 },
  { x: 100, y: 100, z: 0 },
];

describe('buildSegments()', () => {
  it('cuts the path into the segments between its points', () => {
    const segments = buildSegments(route, 0);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ x: 0, y: 0, length: 100, angle: 0 });
    expect(segments[1]).toMatchObject({ x: 100, y: 0, length: 100, angle: 90 });
  });

  it('marks the segments it has passed', () => {
    const segments = buildSegments(route, 0.5);
    expect(segments[0].isTravelled).toBe(true);
    expect(segments[1].isTravelled).toBe(false);
  });

  it('counts them all passed at the end', () => {
    expect(buildSegments(route, 1).every((segment) => segment.isTravelled)).toBe(true);
  });

  it('counts none passed before it starts', () => {
    expect(buildSegments(route, 0).some((segment) => segment.isTravelled)).toBe(false);
  });

  it('drops a segment of no length', () => {
    const segments = buildSegments(
      [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 50, y: 0, z: 0 },
      ],
      0
    );
    expect(segments).toHaveLength(1);
  });

  it('returns nothing without enough points', () => {
    expect(buildSegments([{ x: 0, y: 0, z: 0 }], 0)).toEqual([]);
  });
});

describe('replayRouteMarksOf()', () => {
  it('draws each run at the height it starts at, fainter once passed, and a ring at either end', () => {
    const raised = [
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 0 },
      { x: 100, y: 100, z: 50 },
    ];
    const layers = replayRouteMarksOf(buildSegments(raised, 0.5), [raised[0], raised[2]]);

    expect(layers.map((layer) => layer.heightPx)).toEqual([3, 53]);
    const [first, second, ring] = layers[0].marks;
    expect(first).toMatchObject({
      kind: 'line',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    });
    expect(second).toMatchObject({ kind: 'line', stroke: { colour: 'rgba(120, 200, 255, 0.85)' } });
    expect(ring).toMatchObject({ kind: 'circle', x: 0, y: 0, r: 7 });
    expect(layers[1].marks).toEqual([expect.objectContaining({ kind: 'circle', x: 100, y: 100 })]);
  });
});
