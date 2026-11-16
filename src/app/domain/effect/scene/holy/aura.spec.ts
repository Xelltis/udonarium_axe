import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { castOn, CELL, holyPresetOf, stagedAt, uprightAt } from '@axe/testing/holy-effect-stage';

const TARGET = { x: 400, y: 300 };
const cast = castOn([TARGET]);

/** The bands of a frame that are drawn by halves, of a number of points. */
function halved(drawn: Staged, points: number, half: 'near' | 'far') {
  return drawn.ribbons.filter((ribbon) => ribbon.points.length === points && ribbon.half === half && ribbon.about);
}

describe('an aura of fighting spirit', () => {
  const aura = holyPresetOf('aura', 2, { durationMs: 2064, colorPrimary: '#ffe27a', colorSecondary: '#ff8a1f' });
  const flamesOf = (drawn: Staged, half: 'near' | 'far') =>
    halved(drawn, 7, half).filter((flame) => flame.blend === 'color');

  it('stands flames about the piece by halves, those before it thin enough to see it through', () => {
    const drawn = stagedAt(aura, cast, 0.6);
    const far = flamesOf(drawn, 'far');
    const near = flamesOf(drawn, 'near');

    expect(far.length).toBeGreaterThan(20);
    expect(near.length).toBe(far.length);
    expect(Math.max(...near.map((flame) => flame.alpha))).toBeLessThan(0.4);
    expect(Math.max(...far.flatMap((flame) => flame.points.map((point) => point.z)))).toBeGreaterThan(CELL * 1.6);
  });

  it('stands its blaze close about the piece and licks straight up past its head, rather than closing over it', () => {
    const far = flamesOf(stagedAt(aura, cast, 0.6), 'far');
    const offAt = (flame: (typeof far)[number], index: number) =>
      Math.hypot(flame.points[index].x - TARGET.x, flame.points[index].y - TARGET.y);

    for (const flame of far) {
      expect(offAt(flame, 0)).toBeLessThan(CELL * 0.6);
      expect(offAt(flame, flame.points.length - 1)).toBeGreaterThan(offAt(flame, 0) * 0.4);
    }
  });

  it('breaks out in a leap that throws sparks, and sinks back from it', () => {
    const sparks = stagedAt(aura, cast, 0.2).motes.filter(
      (mote) => mote.shape === 'spark' && Math.hypot(mote.velocity?.x ?? 0, mote.velocity?.y ?? 0) > CELL
    );
    const tallAt = (seconds: number) =>
      Math.max(
        ...flamesOf(stagedAt(aura, cast, seconds), 'far').flatMap((flame) => flame.points.map((point) => point.z))
      );

    expect(sparks.length).toBeGreaterThan(20);
    expect(tallAt(0.2)).toBeGreaterThan(tallAt(0.7) * 1.15);
  });

  it('cracks the floor under it and lifts pebbles off it', () => {
    const drawn = stagedAt(aura, cast, 1);
    const pebbles = drawn.motes.filter((mote) => mote.shape === 'chunk');

    expect(drawn.floor.some((mark) => mark.shape === 'cracks' && mark.blend === 'color')).toBe(true);
    expect(pebbles.some((pebble) => pebble.z > CELL * 0.4)).toBe(true);
  });

  it('leaps as its sound surges', () => {
    const tallAt = (seconds: number) =>
      Math.max(
        ...flamesOf(stagedAt(aura, cast, seconds), 'far').flatMap((flame) => flame.points.map((point) => point.z))
      );
    const calm = Math.max(tallAt(0.7), tallAt(0.74), tallAt(0.78));

    expect(Math.max(tallAt(0.86), tallAt(0.9), tallAt(0.94))).toBeGreaterThan(calm);
  });

  it('lands no blow and moves no clock', () => {
    expect(effectBlowsOf(aura)).toEqual([]);
  });
});

describe('the greatest aura', () => {
  const great = holyPresetOf('aura', 3, { durationMs: 2560, colorPrimary: '#fff0b8', colorSecondary: '#ff5a1f' });
  const breaksOut = effectBlowsOf(great)[0].atMs / 1000;

  it('darkens the floor about the piece and draws light in to it while it gathers, with no pillar yet', () => {
    const drawn = stagedAt(great, cast, breaksOut - 0.08);
    const shadow = drawn.floor.find((mark) => mark.shape === 'disc' && mark.color === '#070403')!;
    const drawnIn = drawn.motes.filter((mote) => mote.shape === 'spark');

    expect(shadow.radius).toBeGreaterThan(CELL * 4);
    expect(shadow.alpha).toBeGreaterThan(0.5);
    expect(drawnIn.length).toBeGreaterThan(4);
    for (const streak of drawnIn) {
      expect((streak.x - TARGET.x) * streak.velocity!.x + (streak.y - TARGET.y) * streak.velocity!.y).toBeLessThan(0);
    }
    expect(uprightAt(drawn, TARGET)).toEqual([]);
    expect(drawn.lights).toEqual([]);
  });

  it('breaks out as its blow lands: a white beat, a pillar into the sky and slabs of the floor heaved up', () => {
    const drawn = stagedAt(great, cast, breaksOut + 0.05);
    const pillar = uprightAt(drawn, TARGET);

    expect(
      drawn.floor.some((mark) => mark.shape === 'disc' && mark.color === '#ffffff' && mark.blend === 'light')
    ).toBe(true);
    expect(Math.max(...pillar.flatMap((band) => band.points.map((point) => point.z)))).toBeGreaterThan(CELL * 3);
    expect(stagedAt(great, cast, breaksOut + 0.2).motes.filter((mote) => mote.shape === 'crag').length).toBeGreaterThan(
      4
    );
  });

  it('lifts the shadow once it has broken out', () => {
    const shadow = stagedAt(great, cast, breaksOut + 0.6).floor.find((mark) => mark.color === '#070403');

    expect(shadow?.alpha ?? 0).toBe(0);
  });

  it('rages taller than the aura of the grade below, and crosses a glint over the piece at the last', () => {
    const lesser = holyPresetOf('aura', 2, { durationMs: 2560, colorPrimary: '#fff0b8', colorSecondary: '#ff5a1f' });
    const tallOf = (drawn: Staged) =>
      Math.max(...halved(drawn, 7, 'far').flatMap((flame) => flame.points.map((point) => point.z)));
    const glint = stagedAt(great, cast, 2.56 - 0.2).motes.filter(
      (mote) => mote.shape === 'flare' && (mote.trail ?? 0) > 10
    );

    expect(tallOf(stagedAt(great, cast, 1.4))).toBeGreaterThan(tallOf(stagedAt(lesser, cast, 1.4)) * 1.3);
    expect(glint.length).toBe(1);
  });
});
