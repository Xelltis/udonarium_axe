import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { sceneLingerMsOf } from '@axe/domain/effect/scene/effect-frame';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { castOn, CELL, holyPresetOf, stagedAt, standsUpright, uprightAt } from '@axe/testing/holy-effect-stage';

const CENTRE = { x: 400, y: 300 };
const OTHERS = [
  { x: 480, y: 340 },
  { x: 330, y: 380 },
];
const AREA = 3 * CELL;
const sanctuary = holyPresetOf('sanctuary', 3, {
  durationMs: 3553,
  staggerMs: 200,
  targeting: 'multi',
  maxTargets: 8,
  areaRadius: 3,
});
const cast = castOn([CENTRE, ...OTHERS]);
const rises = effectBlowsOf(sanctuary)[0].atMs / 1000;

/** The bands that stand on the rim of the crest: straight up, as far from its middle as it reaches. */
function wallsOf(drawn: Staged, reach = AREA): EffectRibbon[] {
  return drawn.ribbons.filter(
    (ribbon) =>
      standsUpright(ribbon) &&
      Math.abs(Math.hypot(ribbon.points[0].x - CENTRE.x, ribbon.points[0].y - CENTRE.y) - reach) < 1
  );
}

describe('a sanctuary', () => {
  it('opens a crest on the floor about the first target, as wide as its area, before any wall stands', () => {
    const early = stagedAt(sanctuary, cast, rises * 0.25);
    const open = stagedAt(sanctuary, cast, rises - 0.03);
    const widest = (drawn: Staged) =>
      Math.max(...drawn.floor.filter((mark) => mark.shape === 'crest').map((mark) => mark.radius));

    expect(widest(early)).toBeLessThan(widest(open));
    expect(widest(open)).toBeCloseTo(AREA);
    for (const crest of open.floor.filter((mark) => mark.shape === 'crest')) {
      expect([crest.x, crest.y, crest.z]).toEqual([CENTRE.x, CENTRE.y, 0]);
    }
    expect(open.floor.some((mark) => mark.shape === 'crest' && mark.blend === 'color')).toBe(true);
    expect(open.ribbons.filter(standsUpright)).toEqual([]);
  });

  it('turns the crest slowly, and a lesser one at its heart the other way', () => {
    const turnsAt = (seconds: number) =>
      stagedAt(sanctuary, cast, seconds)
        .floor.filter((mark) => mark.shape === 'crest' && mark.blend === 'light' && mark.radius > CELL)
        .map((mark) => mark.turn);
    const [outer, inner] = turnsAt(1.5).map((turn, index) => turn - turnsAt(1)[index]);

    expect(outer).toBeGreaterThan(0);
    expect(inner).toBeLessThan(0);
  });

  it('raises walls of light all round the rim of the crest as its blow lands', () => {
    const rising = wallsOf(stagedAt(sanctuary, cast, rises + 0.05));
    const risen = wallsOf(stagedAt(sanctuary, cast, rises + 0.5));
    const tallest = (walls: EffectRibbon[]) =>
      Math.max(...walls.flatMap((wall) => wall.points.map((point) => point.z)));
    const bearings = new Set(
      risen.map((wall) => Math.round(Math.atan2(wall.points[0].y - CENTRE.y, wall.points[0].x - CENTRE.x) * 4))
    );

    expect(risen.length).toBeGreaterThanOrEqual(40);
    expect(bearings.size).toBeGreaterThanOrEqual(24);
    expect(tallest(rising)).toBeLessThan(tallest(risen));
    expect(tallest(risen)).toBeGreaterThan(CELL * 2.5);
    expect(risen.some((wall) => wall.blend === 'color')).toBe(true);
    expect(risen.some((wall) => wall.blend === 'light')).toBe(true);
  });

  it('stands its walls as a body of colour, full behind what they ring and thinner before it, with motes climbing them', () => {
    const drawn = stagedAt(sanctuary, cast, rises + 0.6);
    const body = wallsOf(drawn).filter((wall) => wall.blend === 'color' && wall.half);
    const strongest = (half: 'near' | 'far') =>
      Math.max(...body.filter((wall) => wall.half === half).map((wall) => wall.alpha));
    const climbing = drawn.motes.filter(
      (mote) =>
        mote.shape === 'spark' &&
        (mote.velocity?.z ?? 0) > 0 &&
        Math.abs(Math.hypot(mote.x - CENTRE.x, mote.y - CENTRE.y) - AREA) < CELL * 0.2
    );

    expect(strongest('far')).toBeGreaterThan(0.75);
    expect(strongest('near')).toBeLessThan(strongest('far') * 0.6);
    expect(strongest('near')).toBeGreaterThan(0.3);
    expect(climbing.length).toBeGreaterThan(20);
  });

  it('bursts light up out of the floor under every target it takes in at the same instant, whatever their stagger', () => {
    const before = stagedAt(sanctuary, cast, rises - 0.03);
    const drawn = stagedAt(sanctuary, cast, rises + 0.06);

    for (const at of [CENTRE, ...OTHERS]) {
      expect(uprightAt(before, at)).toEqual([]);
      expect(uprightAt(drawn, at).length).toBeGreaterThan(0);
    }
  });

  it('opens once: the others it takes in have neither a crest nor walls of their own', () => {
    const alone = stagedAt(sanctuary, castOn([CENTRE]), rises + 0.5);
    const drawn = stagedAt(sanctuary, cast, rises + 0.5);
    const crests = (staged: Staged) => staged.floor.filter((mark) => mark.shape === 'crest' && mark.radius > CELL);

    expect(crests(drawn).length).toBe(crests(alone).length);
    expect(wallsOf(drawn).length).toBe(wallsOf(alone).length);
  });

  it('lifts the walls off the floor and away before it ends, and draws nothing once it has cleared', () => {
    const footAt = (seconds: number) =>
      Math.min(...wallsOf(stagedAt(sanctuary, cast, seconds)).flatMap((wall) => wall.points.map((point) => point.z)));
    const liftsAt = (sanctuary.duration / 1000) * 0.72;
    const ends = (sanctuary.duration + sceneLingerMsOf(sanctuary)) / 1000;

    expect(footAt(liftsAt - 0.1)).toBeCloseTo(0);
    expect(footAt(liftsAt + 0.4)).toBeGreaterThan(CELL * 0.5);
    expect(wallsOf(stagedAt(sanctuary, cast, liftsAt + 0.75))).toEqual([]);
    expect(stagedAt(sanctuary, cast, ends + 0.001)).toEqual({ motes: [], ribbons: [], floor: [], lights: [] });
  });

  it('opens a cell or two wide about its target where it is cast over no area', () => {
    const single = holyPresetOf('sanctuary', 3, { durationMs: 3553 });
    const drawn = stagedAt(single, castOn([CENTRE]), rises + 0.5);
    const reach = Math.max(...drawn.floor.filter((mark) => mark.shape === 'crest').map((mark) => mark.radius));

    expect(reach).toBeGreaterThan(CELL);
    expect(reach).toBeLessThan(CELL * 3);
    expect(wallsOf(drawn, reach).length).toBeGreaterThanOrEqual(40);
  });
});
