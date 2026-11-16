import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import {
  bladePresetOf,
  CASTER,
  castOnTarget,
  CELL,
  CRESCENT_POINTS,
  crescentBodiesOf,
  hotEdgesOf,
  lengthOf,
  seamsOf,
  stagedAt,
  TARGET,
  whiteLinesOf,
  widestOf,
} from '@axe/testing/blade-effect-stage';

const cast = castOnTarget();
const MIDDLE = Math.floor(CRESCENT_POINTS / 2);

/** A cut that flies: one, or a volley of four. */
function flyingOf(shots = 1) {
  const preset = bladePresetOf('projectile', 1200, 2);
  preset.projectileStyle = 'crescent';
  preset.impactKind = 'slash';
  preset.shots = shots;
  preset.shotInterval = 110;
  return preset;
}

/** How far a crescent stands up from one horn to the other, against how far it reaches across. */
function tippedOf(edge: EffectRibbon): number {
  const from = edge.points[0];
  const to = edge.points.at(-1)!;
  return Math.abs(to.z - from.z) / (lengthOf(edge) || 1);
}

/** The line torn in the floor: the bands of nine points lying on it. */
function scoreOf(drawn: Staged): EffectRibbon[] {
  return drawn.ribbons.filter((ribbon) => ribbon.points.length === 9 && ribbon.points.every((point) => point.z < 5));
}

describe('a cut that flies', () => {
  const single = flyingOf();
  const lands = effectBlowsOf(single)[0].atMs / 1000;

  it('flies as a crescent across its way, its horns swept back towards the caster', () => {
    const edge = hotEdgesOf(stagedAt(single, cast, lands * 0.5)).at(-1)!;
    const middle = edge.points[MIDDLE];

    expect(Math.abs(edge.points[0].y - edge.points.at(-1)!.y)).toBeGreaterThan(CELL * 2);
    expect(edge.points[0].x).toBeGreaterThan(middle.x + CELL * 0.5);
    expect(edge.points.at(-1)!.x).toBeGreaterThan(middle.x + CELL * 0.5);
    expect(middle.x).toBeLessThan(CASTER.x);
    expect(middle.x).toBeGreaterThan(TARGET.x);
  });

  it('leads with its white-hot edge, a body of full colour in a dark rim streaming behind it', () => {
    const drawn = stagedAt(single, cast, lands * 0.5);
    const edge = hotEdgesOf(drawn).at(-1)!;
    const body = crescentBodiesOf(drawn).at(-1)!;

    expect(edge.points[MIDDLE].x).toBeLessThan(body.points[MIDDLE].x);
    expect(widestOf(body)).toBeGreaterThan(widestOf(edge) * 2);
    expect(widestOf(body)).toBeGreaterThan(CELL * 0.4);
    expect(body.blend).toBe('color');
    expect(drawn.motes.filter((mote) => mote.shape === 'lick').length).toBeGreaterThan(5);
  });

  it('leaves two afterimages of itself where it has just been, fainter the further back', () => {
    const edges = hotEdgesOf(stagedAt(single, cast, lands * 0.7));
    const xs = edges.map((edge) => edge.points[MIDDLE].x);

    expect(edges).toHaveLength(3);
    expect(xs[0]).toBeGreaterThan(xs[1]);
    expect(xs[1]).toBeGreaterThan(xs[2]);
    expect(edges[0].alpha).toBeLessThan(edges[1].alpha);
    expect(edges[1].alpha).toBeLessThan(edges[2].alpha);
  });

  it('tears a glowing line in the floor under its path, which fades after it has landed', () => {
    const shown = (ribbons: EffectRibbon[]) => Math.max(0, ...ribbons.flatMap((ribbon) => ribbon.alphas ?? []));
    const flying = scoreOf(stagedAt(single, cast, lands * 0.6));

    expect(flying.some((ribbon) => ribbon.blend === 'light')).toBe(true);
    expect(flying.some((ribbon) => ribbon.blend === 'color')).toBe(true);
    expect(shown(scoreOf(stagedAt(single, cast, lands + 0.1)))).toBeGreaterThan(0);
    expect(shown(scoreOf(stagedAt(single, cast, lands + 0.1)))).toBeLessThan(shown(flying));
    expect(scoreOf(stagedAt(single, cast, lands + 0.7))).toEqual([]);
  });

  it('carries on through its target a little way and is gone', () => {
    const through = stagedAt(single, cast, lands + 0.07);
    const edge = hotEdgesOf(through).at(-1)!;

    expect(edge.points[MIDDLE].x).toBeLessThan(TARGET.x);
    expect(edge.points[MIDDLE].x).toBeGreaterThan(TARGET.x - CELL * 1.5);
    expect(hotEdgesOf(stagedAt(single, cast, lands + 0.25))).toEqual([]);
  });

  it('lands as two bright lines crossed through the target, a burst, and two seams that gape and close', () => {
    const struck = stagedAt(single, cast, lands + 0.07);
    const tips = [0.03, 0.06, 0.09, 0.12, 0.15]
      .flatMap((since) => whiteLinesOf(stagedAt(single, cast, lands + since)))
      .filter((line) => lengthOf(line) > CELL * 2)
      .map((line) => (line.points.at(-1)!.z - line.points[0].z) / lengthOf(line));

    expect(Math.max(...tips) - Math.min(...tips)).toBeGreaterThan(0.5);
    expect(struck.motes.filter((mote) => mote.shape === 'spark').length).toBeGreaterThan(20);
    expect(struck.floor.some((mark) => mark.shape === 'disc' && mark.blend === 'light')).toBe(true);
    expect(seamsOf(stagedAt(single, cast, lands + 0.3))).toHaveLength(2);
    expect(seamsOf(stagedAt(single, cast, lands + 0.8))).toEqual([]);
  });

  it('swings no blade at the target where it lands: the cut is the crescent’s own', () => {
    for (let since = 0.3; since < 0.9; since += 0.04) {
      expect(crescentBodiesOf(stagedAt(single, cast, lands + since))).toEqual([]);
    }
  });

  it('tips each crescent of a volley its own way and makes the last the largest', () => {
    const volley = flyingOf(4);
    const blows = effectBlowsOf(volley).map((blow) => blow.atMs / 1000);
    const nearest = (drawn: Staged) =>
      hotEdgesOf(drawn)
        .filter((edge) => edge.alpha === 1)
        .sort((a, b) => a.points[MIDDLE].x - b.points[MIDDLE].x)[0];
    const edges = blows.map((at) => nearest(stagedAt(volley, cast, at - 0.03)));
    const tips = edges.map(tippedOf);

    expect(tips[0]).toBeGreaterThan(0.85);
    expect(tips[2]).toBeLessThan(0.2);
    expect(new Set(tips.map((tip) => tip.toFixed(1))).size).toBeGreaterThanOrEqual(3);
    expect(widestOf(edges[3])).toBeGreaterThan(Math.max(...edges.slice(0, 3).map(widestOf)) * 1.2);
  });

  it('crosses only the last cut of a volley with a second', () => {
    const volley = flyingOf(4);
    const blows = effectBlowsOf(volley).map((blow) => blow.atMs / 1000);
    const seamsAfter = (index: number) => seamsOf(stagedAt(volley, cast, blows[index] + 0.3)).length;

    expect(seamsAfter(3) - seamsAfter(0)).toBeGreaterThanOrEqual(2);
  });

  it('only flies where it is a stage of a run, landing nothing', () => {
    const travelling = flyingOf();
    travelling.impactKind = 'burst';
    const landed = stagedAt(travelling, cast, lands + 0.3);

    expect(seamsOf(landed)).toEqual([]);
  });

  it('draws nothing under the floor, and nothing once it has lingered', () => {
    for (let at = 0; at < 2.4; at += 0.03) {
      const drawn = stagedAt(single, cast, at);
      expect(drawn.ribbons.every((ribbon) => ribbon.points.every((point) => point.z >= 0))).toBe(true);
      expect(drawn.motes.every((mote) => mote.z >= 0)).toBe(true);
    }
    const after = stagedAt(single, cast, 4);
    expect(after.ribbons.length + after.motes.length + after.floor.length).toBe(0);
  });
});
