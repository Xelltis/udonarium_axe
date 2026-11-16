import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { effectJoltsOf } from '@axe/domain/effect/effect-reaction';
import { greatSwordTimingOf, UNWIELDED_WAY } from '@axe/domain/effect/great-sword-looks';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { EFFECT_FRAME_BUDGET } from '@axe/domain/effect/scene/effect-scene';
import {
  bladePresetOf,
  bundledOf,
  CASTER,
  castOnTarget,
  CELL,
  cutOf,
  stagedAt,
  TARGET,
} from '@axe/testing/blade-effect-stage';

const cast = castOnTarget();

/** A great sword of three seconds that lands with a kind of look. */
function swordOf(impactKind: EffectKind, primary = '#ffeaa8', secondary = '#ffb320') {
  const preset = bladePresetOf('skyblade', 3000, 3);
  preset.impactKind = impactKind;
  preset.colorPrimary = primary;
  preset.colorSecondary = secondary;
  return preset;
}

const sword = swordOf('heal');
const releases = effectBlowsOf(sword)[0].atMs / 1000;
const timing = greatSwordTimingOf(3, releases);

/** The bands of the sword of steel: those of seven points, from its point to its shoulders. */
function steelOf(drawn: Staged) {
  return drawn.ribbons.filter((ribbon) => ribbon.points.length === 7 && ribbon.blend === 'color');
}

/** The bands of the blade of light: those of nine points laid as colour, from the guard to its point. */
function bladeOf(drawn: Staged) {
  return drawn.ribbons.filter((ribbon) => ribbon.points.length === 9 && ribbon.blend === 'color');
}

/** The bands of the torrent's body: those of twenty-one points. */
function torrentOf(drawn: Staged) {
  return drawn.ribbons.filter((ribbon) => ribbon.points.length === 21);
}

/** The arcs of the fan a swing leaves: those of fifteen points. */
function fanOf(drawn: Staged) {
  return drawn.ribbons.filter((ribbon) => ribbon.points.length === 15);
}

/** How many particles of a shape are drawn. */
function countOf(drawn: Staged, shape: string): number {
  return drawn.motes.filter((mote) => mote.shape === shape).length;
}

describe('the great sword', () => {
  it('is raised over its wielder, not over the target', () => {
    const drawn = stagedAt(sword, cast, 0.6);
    const steel = steelOf(drawn);

    expect(steel.length).toBeGreaterThan(0);
    for (const band of steel) {
      for (const point of band.points) {
        expect(Math.hypot(point.x - CASTER.x, point.y - CASTER.y)).toBeLessThan(CELL * 0.2);
        expect(point.z).toBeGreaterThan(CELL);
      }
    }
    expect(Math.hypot(drawn.lights[0].x - CASTER.x, drawn.lights[0].y - CASTER.y)).toBeLessThan(CELL * 0.2);
  });

  it('grows a blade of light many cells tall out of the sword as light gathers on it', () => {
    const topAt = (seconds: number) =>
      Math.max(...bladeOf(stagedAt(sword, cast, seconds))[0].points.map((point) => point.z));

    expect(topAt(0.2)).toBeLessThan(topAt(timing.gatheredAt) * 0.6);
    expect(topAt(timing.gatheredAt)).toBeGreaterThan(CELL * 4);
    expect(bladeOf(stagedAt(sword, cast, timing.gatheredAt)).some((band) => band.core === '#ffffff')).toBe(true);
  });

  it('draws light in from all about and closes rings over the floor, and lets it hang before the swing', () => {
    const gathering = stagedAt(sword, cast, 0.8);
    const hanging = stagedAt(sword, cast, (timing.gatheredAt + timing.swingsAt) / 2);
    const ringsOf = (drawn: Staged) => drawn.floor.filter((mark) => mark.shape === 'ring');

    expect(countOf(gathering, 'spark')).toBeGreaterThan(30);
    expect(ringsOf(gathering).length).toBeGreaterThan(2);
    expect(ringsOf(hanging)).toEqual([]);
    expect(countOf(hanging, 'star')).toBeGreaterThan(0);
  });

  it('is brought down about the hands towards the target, a fan of light behind it', () => {
    const tipAt = (seconds: number) => bladeOf(stagedAt(sword, cast, seconds))[0].points.at(-1)!;
    const upright = tipAt(timing.swingsAt - 0.2);
    const falling = tipAt((timing.swingsAt + releases) / 2 + 0.05);
    const level = tipAt(releases);

    expect(Math.abs(upright.x - CASTER.x)).toBeLessThan(CELL * 0.3);
    expect(falling.x).toBeLessThan(CASTER.x - CELL * 0.3);
    expect(falling.z).toBeGreaterThan(level.z + CELL);
    expect(level.x).toBeLessThan(CASTER.x - CELL * 3.5);
    expect(level.z).toBeLessThan(CELL * 1.2);
    expect(fanOf(stagedAt(sword, cast, timing.swingsAt - 0.05))).toEqual([]);
    expect(fanOf(stagedAt(sword, cast, releases - 0.03)).length).toBeGreaterThan(4);
  });

  it('lets its torrent go as its blow lands, and not before', () => {
    expect(torrentOf(stagedAt(sword, cast, releases - 0.03))).toEqual([]);
    expect(torrentOf(stagedAt(sword, cast, releases + 0.03)).length).toBeGreaterThan(3);
    expect(bladeOf(stagedAt(sword, cast, releases + 0.1))).toEqual([]);
  });

  it('runs the torrent from its wielder through the target and well past it', () => {
    const [body] = torrentOf(stagedAt(sword, cast, releases + 0.3));
    const along = body.points.map((point) => point.x);

    expect(Math.max(...along)).toBeGreaterThan(TARGET.x + CELL * 0.5);
    expect(Math.max(...along)).toBeLessThan(CASTER.x);
    expect(Math.min(...along)).toBeLessThan(TARGET.x - CELL * 2.5);
    expect(body.points.every((point) => Math.abs(point.y - TARGET.y) < 1)).toBe(true);
  });

  it("thins the torrent from its wielder's end until the last of it has passed", () => {
    const nearEndAt = (seconds: number) =>
      Math.max(...torrentOf(stagedAt(sword, cast, seconds))[0].points.map((point) => point.x));

    expect(nearEndAt((timing.thinsAt + timing.spentAt) / 2)).toBeLessThan(nearEndAt(timing.thinsAt - 0.05) - CELL);
    expect(torrentOf(stagedAt(sword, cast, timing.spentAt + 0.02))).toEqual([]);
  });

  it('scores the floor along the line it ran, and clears it by the end', () => {
    const scoreOf = (seconds: number) =>
      stagedAt(sword, cast, seconds).floor.filter((mark) => mark.shape === 'fissure' && mark.alpha > 0.01);

    expect(scoreOf(releases - 0.1)).toEqual([]);
    expect(scoreOf(releases + 0.6).length).toBeGreaterThan(1);
    expect(scoreOf(releases + 0.6).every((mark) => Math.abs(mark.y - TARGET.y) < 1)).toBe(true);
    expect(scoreOf(3 + 1.796)).toEqual([]);
  });

  it('lands with the look it was given within the torrent, and with nothing before it is let go', () => {
    const fire = swordOf('burst', '#ffd08a', '#ff4a12');

    expect(countOf(stagedAt(fire, cast, releases + 0.1), 'blaze')).toBeGreaterThan(0);
    expect(countOf(stagedAt(fire, cast, releases - 0.2), 'blaze')).toBe(0);
  });

  it.each([
    ['flame', 'lick', 20],
    ['frost', 'flake', 20],
    ['upheaval', 'chunk', 12],
    ['miasma', 'smoke', 6],
    ['smite', 'feather', 4],
  ] as const)('carries what is its own down a torrent that lands with %s', (impactKind, shape, least) => {
    expect(countOf(stagedAt(swordOf(impactKind), cast, releases + 0.35), shape)).toBeGreaterThanOrEqual(least);
  });

  it('forks lightning off a torrent that lands with a bolt', () => {
    const bolts = (kind: EffectKind) =>
      stagedAt(swordOf(kind), cast, releases + 0.35).ribbons.filter((ribbon) => ribbon.points.length === 11).length;

    expect(bolts('arc')).toBeGreaterThan(bolts('impact') + 8);
  });

  it('tears a line of crags out of the ground along a torrent of earth, and none along another', () => {
    const crags = stagedAt(swordOf('impact'), cast, releases + 0.6).motes.filter((mote) => mote.shape === 'crag');

    expect(countOf(stagedAt(sword, cast, releases + 0.6), 'crag')).toBe(0);
    expect(crags.length).toBeGreaterThan(3);
    expect(crags.every((crag) => Math.abs(crag.y - TARGET.y) < CELL * 1.2)).toBe(true);
  });

  it('paints a sword of shadow black at its heart within an edge of its colour', () => {
    const bands = bladeOf(stagedAt(swordOf('miasma', '#d8c6ff', '#5a1f8a'), cast, timing.gatheredAt));

    expect(bands.some((band) => band.core === '#000000')).toBe(true);
    expect(bands.every((band) => band.core !== '#ffffff')).toBe(true);
  });

  it('raises one sword for a cast on several, and lands on each in its turn', () => {
    const other = { x: TARGET.x - CELL, y: TARGET.y + CELL * 3 };
    const two: EffectCast = { ...cast, targets: [...cast.targets, { identifier: 't1', ...other, z: 0 }] };
    const smite = swordOf('smite');
    const landedAt = (seconds: number) =>
      stagedAt(smite, two, seconds).floor.filter((mark) => Math.hypot(mark.x - other.x, mark.y - other.y) < CELL * 0.5)
        .length;

    expect(steelOf(stagedAt(smite, two, 0.6)).length).toBe(steelOf(stagedAt(smite, cast, 0.6)).length);
    expect(landedAt(releases + 0.05)).toBe(0);
    expect(landedAt(releases + 0.3)).toBeGreaterThan(0);
  });

  it('looses a torrent of its own on to each target the first does not reach, in its turn, and sweeps the sword on to it', () => {
    const other = { x: TARGET.x - CELL, y: TARGET.y + CELL * 3 };
    const two: EffectCast = { ...cast, targets: [...cast.targets, { identifier: 't1', ...other, z: 0 }] };
    const inLine: EffectCast = {
      ...cast,
      targets: [...cast.targets, { identifier: 't1', x: TARGET.x - CELL * 2, y: TARGET.y, z: 0 }],
    };
    const later = releases + sword.stagger / 1000;
    const reaching = (drawn: Staged) =>
      torrentOf(drawn).filter((ribbon) =>
        ribbon.points.some((point) => Math.hypot(point.x - other.x, point.y - other.y) < CELL * 0.8)
      );
    const tipOf = (drawn: Staged) => steelOf(drawn).at(-1)!.points[0];

    expect(reaching(stagedAt(sword, two, later - 0.02))).toEqual([]);
    expect(reaching(stagedAt(sword, two, later + 0.2)).length).toBeGreaterThan(0);
    expect(torrentOf(stagedAt(sword, inLine, later + 0.2)).length).toBe(
      torrentOf(stagedAt(sword, cast, later + 0.2)).length
    );
    expect(tipOf(stagedAt(sword, two, later + 0.1)).y).toBeGreaterThan(
      tipOf(stagedAt(sword, cast, later + 0.1)).y + CELL * 0.5
    );
  });

  it('is raised in a place beside the target, and swung from there, when no one casts it', () => {
    const alone = castOnTarget(false);
    const [band] = steelOf(stagedAt(sword, alone, 0.6));
    const [body] = torrentOf(stagedAt(sword, alone, releases + 0.3));
    const from = { x: band.points[0].x - TARGET.x, y: band.points[0].y - TARGET.y };
    const far = Math.hypot(from.x, from.y);

    expect(far).toBeGreaterThan(CELL * 1.5);
    expect(from.x / far).toBeCloseTo(-UNWIELDED_WAY.x, 5);
    expect(from.y / far).toBeCloseTo(-UNWIELDED_WAY.y, 5);
    expect(Math.max(...body.points.map((point) => point.x))).toBeGreaterThan(TARGET.x + CELL * 2);
  });

  it('leaves a cleave pressing what it strikes down', () => {
    const cleave = cutOf('heavy', 2000, 3);
    const jolt = effectJoltsOf(cleave, cast, effectBlowsOf(cleave)[0].atMs + 200, CELL).get('t0')!;

    expect([jolt.x, jolt.y]).toEqual([0, 0]);
    expect(jolt.z).toBeLessThan(0);
  });

  it('draws every bundled great sword to its end within what may be drawn, none of it far below the floor', () => {
    for (const name of ['光の大剣', '炎の大剣', '氷の大剣', '雷の大剣', '大地の大剣', '闇の大剣']) {
      const preset = bundledOf(name);
      for (let at = 0; at < 4.8; at += 0.1) {
        const drawn = stagedAt(preset, cast, at);
        const points = drawn.ribbons.reduce((sum, ribbon) => sum + ribbon.points.length, 0);
        expect(drawn.ribbons.every((ribbon) => ribbon.points.every((point) => point.z > -CELL * 0.8))).toBe(true);
        expect(points).toBeLessThan(EFFECT_FRAME_BUDGET.ribbonPoints / 2);
        expect(drawn.motes.length).toBeLessThan(EFFECT_FRAME_BUDGET.motes / 4);
        expect(drawn.floor.length).toBeLessThan(EFFECT_FRAME_BUDGET.marks / 2);
      }
      expect(stagedAt(preset, cast, 4.81).motes).toEqual([]);
      preset.destroy();
    }
  });
});
