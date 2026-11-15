import { type Staged } from '@axe/domain/effect/scene/choreography';
import { castOn, CELL, holyPresetOf, stagedAt } from '@axe/testing/holy-effect-stage';

const TARGET = { x: 400, y: 300 };
const cast = castOn([TARGET]);

/** How far a point is from the target over the floor. */
function outOf(point: { x: number; y: number }): number {
  return Math.hypot(point.x - TARGET.x, point.y - TARGET.y);
}

/** The bands of a frame that are drawn by halves, of a number of points. */
function halved(drawn: Staged, points: number, half: 'near' | 'far') {
  return drawn.ribbons.filter((ribbon) => ribbon.points.length === points && ribbon.half === half && ribbon.about);
}

describe('a ward', () => {
  const ward = holyPresetOf('barrier', 2, { durationMs: 1080, colorPrimary: '#bfe6ff', colorSecondary: '#3f8bff' });
  /** The edges of the panes of a frame on one side of the shell, each a closed line of six corners. */
  const edgesOf = (drawn: Staged, half: 'near' | 'far') =>
    halved(drawn, 7, half).filter((edge) => edge.blend === 'color');
  const topOf = (seconds: number) =>
    Math.max(...edgesOf(stagedAt(ward, cast, seconds), 'far').flatMap((edge) => edge.points.map((point) => point.z)));

  it('lands its panes row upon row from the floor up, each on both sides of the piece', () => {
    expect(edgesOf(stagedAt(ward, cast, 0.03), 'far').length).toBeLessThan(
      edgesOf(stagedAt(ward, cast, 0.3), 'far').length
    );
    expect(topOf(0.03)).toBeLessThan(topOf(0.3));
    expect(edgesOf(stagedAt(ward, cast, 0.3), 'far').length).toBe(35);
    expect(edgesOf(stagedAt(ward, cast, 0.3), 'near').length).toBe(35);
  });

  it('lays the edges of its panes on the dome itself, so it is a dome from any side', () => {
    const panes = edgesOf(stagedAt(ward, cast, 0.5), 'far').filter(
      (edge) => new Set(edge.points.map((point) => Math.round(point.z))).size > 2
    );
    const heightOf = (point: { x: number; y: number; z: number }) =>
      point.z / Math.sin(Math.acos(Math.min(1, outOf(point) / (CELL * 1.1))));
    const height = heightOf(panes[0].points[0]);

    expect(panes.length).toBe(34);
    for (const pane of panes) for (const point of pane.points) expect(heightOf(point)).toBeCloseTo(height, 0);
  });

  it('draws the near side of the shell thinner than the far side, so the piece is seen through it', () => {
    const drawn = stagedAt(ward, cast, 0.5);
    const veils = (half: 'near' | 'far') => halved(drawn, 29, half).filter((veil) => veil.blend === 'color');

    expect(edgesOf(drawn, 'near')[0].alpha).toBeLessThan(edgesOf(drawn, 'far')[0].alpha * 0.6);
    expect(veils('far').length).toBe(4);
    expect(veils('near')[0].alpha).toBeLessThan(veils('far')[0].alpha * 0.5);
  });

  it('flashes each pane as it lands and runs a glint across the shell while it stands', () => {
    const shineOf = (seconds: number) =>
      Math.max(
        0,
        ...halved(stagedAt(ward, cast, seconds), 4, 'far')
          .filter((pane) => pane.blend === 'light')
          .map((pane) => pane.alpha)
      );

    expect(shineOf(0.05)).toBeGreaterThan(0.6);
    expect(shineOf(0.31)).toBeLessThan(0.3);
    expect(shineOf(1.08 * 0.3 + 0.15)).toBeGreaterThan(0.6);
  });

  it('stands for as long as it sounds and folds away from its crown down after it', () => {
    expect(edgesOf(stagedAt(ward, cast, 1.0), 'far').length).toBe(35);
    expect(topOf(1.45)).toBeLessThan(topOf(1.0));
    expect(stagedAt(ward, cast, 1.08 + 0.85)).toEqual({ motes: [], ribbons: [], floor: [], lights: [] });
  });

  it('keeps the dark edges of its near side for a cast on one or two, and lets them go for more', () => {
    const many = castOn([TARGET, { x: 520, y: 300 }, { x: 640, y: 300 }]);

    expect(edgesOf(stagedAt(ward, cast, 0.5), 'near').length).toBe(35);
    expect(edgesOf(stagedAt(ward, many, 0.5), 'near')).toEqual([]);
    expect(edgesOf(stagedAt(ward, many, 0.5), 'far').length).toBeGreaterThan(90);
  });
});

describe('a mirror', () => {
  const mirror = holyPresetOf('barrier', 3, { durationMs: 1176, colorPrimary: '#ffe9a8', colorSecondary: '#ffab2b' });
  const facesOf = (drawn: Staged) =>
    halved(drawn, 4, 'far').filter((face) => face.blend === 'color' && Array.isArray(face.widths) && face.core);

  it('closes eight faces in on the piece from every side, drawn to a point over its head', () => {
    const outAt = (seconds: number) =>
      Math.max(...facesOf(stagedAt(mirror, cast, seconds)).map((face) => outOf(face.points[1])));
    const locked = facesOf(stagedAt(mirror, cast, 0.3));

    expect(locked.length).toBe(8);
    expect(outAt(0.03)).toBeGreaterThan(outAt(0.3) * 1.5);
    for (const face of locked) {
      expect(outOf(face.points[3])).toBeLessThan(outOf(face.points[1]) * 0.2);
      expect(face.points[3].z).toBeGreaterThan(CELL * 1.4);
    }
  });

  it('is struck from outside and throws back shards along the way the blow came', () => {
    const before = stagedAt(mirror, cast, 0.25);
    const after = stagedAt(mirror, cast, 0.4);
    const coming = before.motes.filter((mote) => mote.shape === 'comet');
    const shards = after.motes.filter((mote) => mote.shape === 'chunk');

    expect(coming.length).toBeGreaterThan(0);
    expect(before.motes.filter((mote) => mote.shape === 'chunk')).toEqual([]);
    expect(shards.length).toBeGreaterThan(5);
    const way = { x: coming[0].x - TARGET.x, y: coming[0].y - TARGET.y };
    const thrown = shards.filter((shard) => (shard.x - TARGET.x) * way.x + (shard.y - TARGET.y) * way.y > 0);
    expect(thrown.length).toBe(shards.length);
  });

  it('is not the ward of the grade below it: a crystal of tall faces, and no honeycomb of panes', () => {
    const ward = holyPresetOf('barrier', 2, { durationMs: 1176, colorPrimary: '#ffe9a8', colorSecondary: '#ffab2b' });

    expect(halved(stagedAt(ward, cast, 0.5), 7, 'far').length).toBeGreaterThan(30);
    expect(halved(stagedAt(mirror, cast, 0.5), 7, 'far')).toEqual([]);
    expect(facesOf(stagedAt(ward, cast, 0.5))).toEqual([]);
  });
});
