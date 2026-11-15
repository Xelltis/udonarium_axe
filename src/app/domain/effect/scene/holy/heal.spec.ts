import { GRACE_RISES_AT, GRACE_SETS_DOWN_AT } from '@axe/domain/effect/blessing-looks';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { castOn, CELL, holyPresetOf, liesLevel, stagedAt, uprightAt } from '@axe/testing/holy-effect-stage';

const TARGET = { x: 400, y: 300 };
const cast = castOn([TARGET]);
const OTHER = { x: 520, y: 360 };
const GREEN = { colorPrimary: '#eaffd4', colorSecondary: '#31d97a' };

/** How far a point is from the target over the floor. */
function outOf(point: { x: number; y: number }): number {
  return Math.hypot(point.x - TARGET.x, point.y - TARGET.y);
}

/** The level rings a frame draws about the target, each as how high it is. */
function ringHeights(drawn: Staged): number[] {
  return drawn.ribbons
    .filter((ribbon) => ribbon.points.length > 30 && liesLevel(ribbon))
    .map((ring) => ring.points[0].z);
}

describe('a mending', () => {
  const mend = holyPresetOf('heal', 1, { durationMs: 1698, ...GREEN });

  it('opens a ring of life under the target and sprouts blades from it', () => {
    const drawn = stagedAt(mend, cast, 0.5);
    const sprouts = drawn.motes.filter((mote) => mote.shape === 'tongue' && mote.z < CELL * 1.2);

    expect(drawn.floor.filter((mark) => mark.shape === 'ring' && mark.blend === 'color').length).toBeGreaterThan(1);
    expect(sprouts.length).toBeGreaterThan(20);
    for (const sprout of sprouts) expect(outOf(sprout)).toBeGreaterThan(CELL * 0.8);
  });

  it('winds bands of light up about the body by halves, which have climbed past its head as the flower opens', () => {
    const early = stagedAt(mend, cast, 0.2);
    const topOf = (drawn: Staged) =>
      Math.max(
        ...drawn.ribbons
          .filter((ribbon) => ribbon.half === 'far')
          .flatMap((ribbon) => ribbon.points.map((point) => point.z))
      );

    expect(early.ribbons.some((ribbon) => ribbon.half === 'near')).toBe(true);
    expect(topOf(early)).toBeLessThan(CELL);
    expect(topOf(stagedAt(mend, cast, 0.55))).toBeGreaterThan(CELL);
  });

  it('opens a flower over the head as its sound swells, and not before', () => {
    const petalsOf = (seconds: number) =>
      stagedAt(mend, cast, seconds).motes.filter((mote) => mote.shape === 'tongue' && mote.z > CELL * 1.3);

    expect(petalsOf(0.3)).toEqual([]);
    expect(petalsOf(0.8).length).toBeGreaterThan(20);
  });

  it('lets its petals go to drift down, and has cleared when its linger is over', () => {
    const late = stagedAt(mend, cast, 1.698 + 0.3);

    expect(late.motes.some((mote) => mote.shape === 'feather')).toBe(true);
    expect(stagedAt(mend, cast, 1.698 + 1.25)).toEqual({ motes: [], ribbons: [], floor: [], lights: [] });
  });

  it('lands no blow, so nothing holds still for it', () => {
    expect(effectBlowsOf(mend)).toEqual([]);
  });
});

describe('a rain of light', () => {
  const rain = holyPresetOf('heal', 2, { durationMs: 2142, ...GREEN });

  it('opens a ring high over the head, which a mending never does', () => {
    const mend = holyPresetOf('heal', 1, { durationMs: 1698, ...GREEN });

    expect(Math.max(...ringHeights(stagedAt(rain, cast, 0.5)))).toBeGreaterThan(CELL * 2);
    expect(ringHeights(stagedAt(mend, cast, 0.5)).filter((z) => z > CELL * 2)).toEqual([]);
  });

  it('pours drops down from the ring while it rains, and none once it has stopped', () => {
    const dropsAt = (seconds: number) => stagedAt(rain, cast, seconds).motes.filter((mote) => mote.shape === 'comet');

    expect(dropsAt(0.9).length).toBeGreaterThan(3);
    for (const drop of dropsAt(0.9)) expect(drop.velocity!.z).toBeLessThan(0);
    expect(dropsAt(2.1)).toEqual([]);
  });

  it('bursts the ring into leaves that drift down after it', () => {
    expect(stagedAt(rain, cast, 1.2).motes.filter((mote) => mote.shape === 'feather')).toEqual([]);
    expect(stagedAt(rain, cast, 2.142).motes.filter((mote) => mote.shape === 'feather').length).toBeGreaterThan(8);
  });
});

describe('a grace', () => {
  const grace = holyPresetOf('heal', 3, { durationMs: 3605, staggerMs: 150, ...GREEN });
  const both = castOn([TARGET, OTHER]);
  const rises = 3.605 * GRACE_RISES_AT;
  const setsDown = 3.605 * GRACE_SETS_DOWN_AT;
  const middle = { x: (TARGET.x + OTHER.x) / 2, y: (TARGET.y + OTHER.y) / 2 };

  it('opens one seal on the floor about the middle of all it is laid on', () => {
    const crests = stagedAt(grace, both, rises * 0.8).floor.filter((mark) => mark.shape === 'crest');

    expect(crests.length).toBeGreaterThan(0);
    for (const crest of crests) {
      expect(crest.x).toBeCloseTo(middle.x);
      expect(crest.y).toBeCloseTo(middle.y);
    }
  });

  it('raises no dome and no pillar before its sound swells', () => {
    const drawn = stagedAt(grace, both, rises - 0.05);

    expect(drawn.ribbons.filter((ribbon) => ribbon.half)).toEqual([]);
    expect(uprightAt(drawn, TARGET)).toEqual([]);
  });

  it('raises a dome of ribs by halves over them and stands a pillar through each at the same moment', () => {
    const drawn = stagedAt(grace, both, rises + 0.6);
    const ribs = drawn.ribbons.filter((ribbon) => ribbon.half === 'far' && ribbon.points.length === 11);
    const crown = Math.max(...ribs.flatMap((rib) => rib.points.map((point) => point.z)));

    expect(ribs.length).toBeGreaterThanOrEqual(12);
    expect(crown).toBeGreaterThan(CELL * 1.5);
    expect(uprightAt(drawn, TARGET).length).toBeGreaterThan(0);
    expect(uprightAt(drawn, OTHER).length).toBeGreaterThan(0);
  });

  it('lets feathers and petals drift down under the dome while it stands', () => {
    expect(
      stagedAt(grace, both, (rises + setsDown) / 2).motes.filter((mote) => mote.shape === 'feather').length
    ).toBeGreaterThan(6);
  });

  it('lets its ribs fall open away from the middle, and is gone when its linger is over', () => {
    const reachOf = (seconds: number) =>
      Math.max(
        ...stagedAt(grace, both, seconds)
          .ribbons.filter((ribbon) => ribbon.half === 'far' && ribbon.points.length === 11)
          .flatMap((rib) => rib.points.map((point) => Math.hypot(point.x - middle.x, point.y - middle.y)))
      );

    expect(reachOf(setsDown + 0.5)).toBeGreaterThan(reachOf(setsDown - 0.1) * 1.2);
    expect(stagedAt(grace, both, 3.605 + 0.15 + 1.25)).toEqual({ motes: [], ribbons: [], floor: [], lights: [] });
  });
});

describe('the cleansings', () => {
  const purge = holyPresetOf('heal', 1, {
    durationMs: 2429,
    moteStyle: 'cleanse',
    colorPrimary: '#e8ffff',
    colorSecondary: '#49c9ff',
  });
  const wash = holyPresetOf('heal', 2, {
    durationMs: 2351,
    moteStyle: 'cleanse',
    colorPrimary: '#eaffd4',
    colorSecondary: '#49c9ff',
  });
  const murkOf = (drawn: Staged) => drawn.motes.filter((mote) => mote.color === '#1c0a2e');

  it('shows what ails the piece clinging to it before anything is done about it', () => {
    for (const preset of [purge, wash]) {
      const clinging = murkOf(stagedAt(preset, cast, 0.12)).filter((mote) => mote.shape === 'wisp');
      expect(clinging.length).toBeGreaterThan(4);
    }
  });

  it('drives a ring of water up the body as it purges, and catches the murk it drives out in bubbles', () => {
    const ringAt = (seconds: number) => Math.max(...ringHeights(stagedAt(purge, cast, seconds)));
    const drawn = stagedAt(purge, cast, 0.85);

    expect(ringAt(0.6)).toBeGreaterThan(ringAt(0.3));
    expect(drawn.motes.filter((mote) => mote.shape === 'bubble').length).toBeGreaterThan(3);
    expect(murkOf(drawn).filter((mote) => mote.shape === 'puff').length).toBeGreaterThan(3);
    for (const clot of murkOf(drawn).filter((mote) => mote.shape === 'puff'))
      expect(outOf(clot)).toBeGreaterThan(CELL * 0.2);
  });

  it('bursts the bubbles one after another, and leaves no murk at all', () => {
    const bubblesAt = (seconds: number) =>
      stagedAt(purge, cast, seconds).motes.filter((mote) => mote.shape === 'bubble').length;

    expect(bubblesAt(1.3)).toBeLessThan(bubblesAt(0.92));
    expect(bubblesAt(1.3)).toBeGreaterThan(0);
    expect(murkOf(stagedAt(purge, cast, 2.1))).toEqual([]);
    expect(stagedAt(purge, cast, 2.1).motes.some((mote) => mote.shape === 'star')).toBe(true);
  });

  it('runs a wave down the body as it washes, from a drop that falls on the head', () => {
    const ringAt = (seconds: number) => Math.min(...ringHeights(stagedAt(wash, cast, seconds)));

    expect(stagedAt(wash, cast, 0.15).motes.some((mote) => mote.shape === 'comet' && mote.z > CELL * 2)).toBe(true);
    expect(ringAt(0.75)).toBeLessThan(ringAt(0.5));
  });

  it('carries the murk off over the floor as a dark ring that spreads, is overtaken and is gone', () => {
    const darkAt = (seconds: number) =>
      stagedAt(wash, cast, seconds).floor.filter((mark) => mark.shape === 'ring' && mark.color === '#1c0a2e');

    expect(darkAt(0.6)).toEqual([]);
    expect(darkAt(1.0).length).toBe(1);
    expect(darkAt(1.4)[0].radius).toBeGreaterThan(darkAt(1.0)[0].radius);
    expect(darkAt(2.0)).toEqual([]);
    expect(murkOf(stagedAt(wash, cast, 2.0))).toEqual([]);
  });
});
