import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import {
  bladePresetOf,
  CASTER,
  castOnTarget,
  CELL,
  hardEdgesOf,
  stagedAt,
  TARGET,
  wakesOf,
  widestOf,
} from '@axe/testing/blade-effect-stage';

const cast = castOnTarget();
const CRESCENT_POINTS = 15;

/** A cut that flies: one, or a volley of four. */
function flyingOf(shots = 1) {
  const preset = bladePresetOf('projectile', 1200, 2);
  preset.projectileStyle = 'crescent';
  preset.impactKind = 'slash';
  preset.shots = shots;
  preset.shotInterval = 110;
  return preset;
}

/** The leading edges of the crescents in the air, the ghosts they leave among them. */
function crescentsOf(drawn: Staged): EffectRibbon[] {
  return hardEdgesOf(drawn).filter((ribbon) => ribbon.points.length === CRESCENT_POINTS);
}

/** How far a crescent stands up from one horn to the other, against how far it reaches across. */
function tippedOf(edge: EffectRibbon): number {
  const from = edge.points[0];
  const to = edge.points.at(-1)!;
  return Math.abs(to.z - from.z) / (Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) || 1);
}

describe('a cut that flies', () => {
  const single = flyingOf();
  const lands = effectBlowsOf(single)[0].atMs / 1000;

  it('flies as a crescent across its way, its horns swept back towards the caster', () => {
    const edge = crescentsOf(stagedAt(single, cast, lands * 0.5)).at(-1)!;
    const middle = edge.points[Math.floor(CRESCENT_POINTS / 2)];

    expect(Math.abs(edge.points[0].y - edge.points.at(-1)!.y)).toBeGreaterThan(CELL * 1.2);
    expect(edge.points[0].x).toBeGreaterThan(middle.x + CELL * 0.2);
    expect(edge.points.at(-1)!.x).toBeGreaterThan(middle.x + CELL * 0.2);
    expect(middle.x).toBeLessThan(CASTER.x);
    expect(middle.x).toBeGreaterThan(TARGET.x);
  });

  it('leads with a hard edge and streams a torn wake behind it', () => {
    const drawn = stagedAt(single, cast, lands * 0.5);
    const edge = crescentsOf(drawn).at(-1)!;
    const [wake] = wakesOf(drawn);
    const middle = Math.floor(CRESCENT_POINTS / 2);

    expect(wake.points[middle].x).toBeGreaterThan(edge.points[middle].x);
    expect(widestOf(wake)).toBeGreaterThan(widestOf(edge) * 3);
  });

  it('leaves ghosts of itself where it has just been, fainter the further back', () => {
    const edges = crescentsOf(stagedAt(single, cast, lands * 0.7));
    const xs = edges.map((edge) => edge.points[Math.floor(CRESCENT_POINTS / 2)].x);

    expect(edges).toHaveLength(3);
    expect(xs[0]).toBeGreaterThan(xs[1]);
    expect(xs[1]).toBeGreaterThan(xs[2]);
    expect(edges[0].alpha).toBeLessThan(edges[1].alpha);
    expect(edges[1].alpha).toBeLessThan(edges[2].alpha);
  });

  it('scores the floor under its path, the score fading after it has landed', () => {
    const scoreOf = (seconds: number) =>
      stagedAt(single, cast, seconds).ribbons.filter(
        (ribbon) => ribbon.points.length === 9 && ribbon.points.every((point) => point.z < 5)
      );
    const shown = (ribbons: EffectRibbon[]) => Math.max(0, ...ribbons.flatMap((ribbon) => ribbon.alphas ?? []));

    expect(scoreOf(lands * 0.6).length).toBeGreaterThan(0);
    expect(shown(scoreOf(lands + 0.1))).toBeGreaterThan(0);
    expect(shown(scoreOf(lands + 0.1))).toBeLessThan(shown(scoreOf(lands * 0.6)));
    expect(scoreOf(lands + 0.6)).toEqual([]);
  });

  it('carries on through its target a little way and is gone, leaving its cut and its sparks thrown on ahead', () => {
    const through = stagedAt(single, cast, lands + 0.07);
    const edge = crescentsOf(through).at(-1)!;
    const after = stagedAt(single, cast, lands + 0.25);
    const sparks = through.motes.filter((mote) => mote.shape === 'spark' && (mote.velocity?.x ?? 0) < -CELL);

    expect(edge.points[Math.floor(CRESCENT_POINTS / 2)].x).toBeLessThan(TARGET.x);
    expect(edge.points[Math.floor(CRESCENT_POINTS / 2)].x).toBeGreaterThan(TARGET.x - CELL * 1.5);
    expect(crescentsOf(after)).toEqual([]);
    expect(after.ribbons.some((ribbon) => ribbon.points.length === 9 && ribbon.core === '#ffffff')).toBe(true);
    expect(sparks.length).toBeGreaterThan(6);
  });

  it('swings no blade at the target where it lands: the cut is the crescent’s own', () => {
    for (let since = 0; since < 0.6; since += 0.04) {
      expect(stagedAt(single, cast, lands + since).ribbons.every((ribbon) => ribbon.points.length !== 21)).toBe(true);
    }
  });

  it('tips each crescent of a volley its own way: upright, slanting and level', () => {
    const volley = flyingOf(4);
    const blows = effectBlowsOf(volley).map((blow) => blow.atMs / 1000);
    const nearest = (drawn: Staged) =>
      crescentsOf(drawn)
        .filter((edge) => edge.alpha === 1)
        .sort((a, b) => a.points[7].x - b.points[7].x)[0];
    const tips = blows.map((at) => tippedOf(nearest(stagedAt(volley, cast, at - 0.03))));

    expect(tips[0]).toBeGreaterThan(0.85);
    expect(tips[2]).toBeLessThan(0.2);
    expect(new Set(tips.map((tip) => tip.toFixed(1))).size).toBeGreaterThanOrEqual(3);
  });

  it('only flies where it is a stage of a run, landing nothing', () => {
    const travelling = flyingOf();
    travelling.impactKind = 'burst';
    const landed = stagedAt(travelling, cast, lands + 0.05);

    expect(landed.ribbons.some((ribbon) => ribbon.points.length === 9 && ribbon.core === '#ffffff')).toBe(false);
  });
});
