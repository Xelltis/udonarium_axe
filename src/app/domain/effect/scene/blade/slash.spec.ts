import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { bladeTonesOf } from '@axe/domain/effect/scene/blade/blade-tones';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { SLASH_COMBO_OPENS_AT } from '@axe/domain/effect/timeline/blade';
import {
  CASTER,
  castOnTarget,
  CELL,
  CRESCENT_POINTS,
  crescentBodiesOf,
  cutOf,
  hotEdgesOf,
  lengthOf,
  seamsOf,
  stagedAt,
  TARGET,
  whiteLinesOf,
  widestOf,
} from '@axe/testing/blade-effect-stage';

const cast = castOnTarget();
const tones = bladeTonesOf('#ffffff', '#7fd4ff');
const MIDDLE = Math.floor(CRESCENT_POINTS / 2);

/** The way a straight band runs, of length one. */
function wayOf(ribbon: EffectRibbon): { x: number; y: number; z: number } {
  const from = ribbon.points[0];
  const to = ribbon.points[ribbon.points.length - 1];
  const far = lengthOf(ribbon) || 1;
  return { x: (to.x - from.x) / far, y: (to.y - from.y) / far, z: (to.z - from.z) / far };
}

describe('one stroke of a cut', () => {
  const cut = cutOf('single', 1000);
  const crosses = effectBlowsOf(cut)[0].atMs / 1000;
  const hung = crosses + 0.12;

  it('glints where the blade is drawn back, before anything swings', () => {
    const before = stagedAt(cut, cast, crosses - 0.09);

    expect(before.ribbons).toEqual([]);
    expect(before.motes.some((mote) => mote.shape === 'star')).toBe(true);
  });

  it('is just through the target as its blow lands, and swings on past it', () => {
    const head = (seconds: number) => hotEdgesOf(stagedAt(cut, cast, seconds))[0].points.at(-1)!;
    const landing = head(crosses);

    expect(Math.hypot(landing.x - TARGET.x, landing.y - TARGET.y)).toBeLessThan(CELL * 0.6);
    expect(Math.abs(head(hung).y - TARGET.y)).toBeGreaterThan(CELL);
  });

  it('swings its arc about its caster, through the target, its ends bowed back', () => {
    const [body] = crescentBodiesOf(stagedAt(cut, cast, hung)).slice(-1);
    const xs = body.points.map((point) => point.x);

    expect(Math.min(...xs)).toBeLessThan(TARGET.x + CELL * 0.4);
    expect(xs[0]).toBeGreaterThan(TARGET.x + CELL * 0.5);
    expect(xs[xs.length - 1]).toBeGreaterThan(TARGET.x + CELL * 0.5);
  });

  it('spans more than two cells from point to point', () => {
    const [body] = crescentBodiesOf(stagedAt(cut, cast, hung)).slice(-1);

    expect(lengthOf(body)).toBeGreaterThan(CELL * 2);
  });

  it('is a crescent and no lens: thinner at its belly than its arc bows', () => {
    const [body] = crescentBodiesOf(stagedAt(cut, cast, crosses + 0.095)).slice(-1);
    const from = body.points[0];
    const way = wayOf(body);
    const bowed = Math.max(
      ...body.points.map((point) => {
        const off = { x: point.x - from.x, y: point.y - from.y, z: point.z - from.z };
        const along = off.x * way.x + off.y * way.y + off.z * way.z;
        return Math.hypot(off.x - way.x * along, off.y - way.y * along, off.z - way.z * along);
      })
    );

    expect(widestOf(body)).toBeLessThan(bowed * 0.8);
    expect(widestOf(body)).toBeGreaterThan(CELL * 0.35);
  });

  it('paints a body of full colour within a dark rim, white-hot along the side of its caster', () => {
    const drawn = stagedAt(cut, cast, hung);
    const [body] = crescentBodiesOf(drawn).slice(-1);
    const [hot] = hotEdgesOf(drawn);
    const rim = drawn.ribbons.find((ribbon) => ribbon.color === tones.rim && widestOf(ribbon) > widestOf(body))!;

    expect(body.color).toBe(tones.body);
    expect(body.blend).toBe('color');
    expect(rim.blend).toBe('color');
    expect(widestOf(hot)).toBeLessThan(widestOf(body) * 0.5);
    expect(Math.abs(hot.points[MIDDLE].x - CASTER.x)).toBeLessThan(Math.abs(body.points[MIDDLE].x - CASTER.x));
  });

  it('draws the crescent to a needle at both ends, its belly behind its head', () => {
    const widths = crescentBodiesOf(stagedAt(cut, cast, hung)).at(-1)!.widths as number[];
    const widest = widths.indexOf(Math.max(...widths));

    expect(widths[0]).toBeLessThan(Math.max(...widths) * 0.05);
    expect(widths[widths.length - 1]).toBeLessThan(Math.max(...widths) * 0.05);
    expect(widths[1]).toBeLessThan(Math.max(...widths) * 0.1);
    expect(widest).toBeGreaterThan(widths.length / 2);
  });

  it('trails afterimages of itself, each wider and fainter than the last', () => {
    const bodies = crescentBodiesOf(stagedAt(cut, cast, crosses + 0.05));
    const ghosts = bodies.slice(0, -1).reverse();

    expect(ghosts.length).toBeGreaterThanOrEqual(2);
    expect(widestOf(ghosts[0])).toBeGreaterThan(widestOf(bodies.at(-1)!));
    expect(widestOf(ghosts[1])).toBeGreaterThan(widestOf(ghosts[0]));
    expect(ghosts[1].alpha).toBeLessThan(ghosts[0].alpha);
    expect(ghosts[0].alpha).toBeLessThan(bodies.at(-1)!.alpha);
  });

  it('streaks the air along its sweep with lines of speed', () => {
    const lines = stagedAt(cut, cast, crosses + 0.05).ribbons.filter((ribbon) => ribbon.points.length === 5);

    expect(lines.length).toBeGreaterThanOrEqual(6);
    expect(lines.every((line) => widestOf(line) < CELL * 0.1)).toBe(true);
  });

  it('hangs once the blade has passed and dissolves from its tail towards its head', () => {
    const bodyAt = (seconds: number) => crescentBodiesOf(stagedAt(cut, cast, seconds)).at(-1)!;
    const fresh = bodyAt(crosses + 0.15);
    const going = bodyAt(crosses + 0.4);

    expect(going.points.at(-1)!.y).toBeCloseTo(fresh.points.at(-1)!.y, 3);
    expect(lengthOf(going)).toBeLessThan(lengthOf(fresh) * 0.8);
    expect(widestOf(going)).toBeLessThan(widestOf(fresh));
    expect(crescentBodiesOf(stagedAt(cut, cast, crosses + 0.75))).toEqual([]);
  });

  it('stops on one bright line through the target, cells past it both ways, as its blow lands', () => {
    const [line] = whiteLinesOf(stagedAt(cut, cast, crosses + 0.02));
    const middle = line.points[Math.floor(line.points.length / 2)];

    expect(Math.hypot(middle.x - TARGET.x, middle.y - TARGET.y)).toBeLessThan(1);
    expect(lengthOf(line)).toBeGreaterThan(CELL * 5);
    expect(widestOf(line)).toBeLessThan(CELL * 0.12);
    expect(whiteLinesOf(stagedAt(cut, cast, crosses - 0.02))).toEqual([]);
  });

  it('bursts a star of thick spikes out of the target as it crosses, its impact frame, and only for an instant', () => {
    const spikesAt = (since: number) =>
      stagedAt(cut, cast, crosses + since).motes.filter((mote) => mote.shape === 'tongue' && mote.blend === 'color');

    expect(spikesAt(-0.02)).toEqual([]);
    expect(spikesAt(0.03).length).toBeGreaterThanOrEqual(30);
    expect(spikesAt(0.03).some((spike) => spike.color === tones.rim)).toBe(true);
    expect(spikesAt(0.15)).toEqual([]);
  });

  it('lights the floor and bursts into sparks and shards as it does, and leaves a glint', () => {
    const struck = stagedAt(cut, cast, crosses + 0.03);
    const after = stagedAt(cut, cast, crosses + 0.3);

    expect(struck.floor.some((mark) => mark.shape === 'disc' && mark.blend === 'light')).toBe(true);
    expect(struck.lights.length).toBeGreaterThan(0);
    expect(struck.motes.filter((mote) => mote.shape === 'spark').length).toBeGreaterThan(14);
    expect(struck.motes.filter((mote) => mote.shape === 'flake').length).toBeGreaterThanOrEqual(6);
    expect(after.floor.some((mark) => mark.shape === 'disc')).toBe(false);
    expect(after.motes.some((mote) => mote.shape === 'flare')).toBe(true);
  });

  it('opens the cut it leaves into a seam that gapes, sprays light and closes', () => {
    const seamAt = (since: number) => seamsOf(stagedAt(cut, cast, crosses + since))[0];

    expect(seamAt(0.04)).toBeUndefined();
    expect(widestOf(seamAt(0.25))).toBeGreaterThan(widestOf(seamAt(0.1)));
    expect(widestOf(seamAt(0.65))).toBeLessThan(widestOf(seamAt(0.25)));
    expect(seamAt(0.8)).toBeUndefined();
    expect(Math.abs(wayOf(seamAt(0.25)).y)).toBeGreaterThan(0.8);
  });

  it('scores the floor under the stroke, across its caster’s sight', () => {
    const [score] = stagedAt(cut, cast, crosses + 0.2).floor.filter((mark) => mark.shape === 'fissure');

    expect(Math.hypot(score.x - TARGET.x, score.y - TARGET.y)).toBeLessThan(1);
    expect(Math.abs(Math.sin(score.turn))).toBeGreaterThan(0.9);
    expect(stagedAt(cut, cast, crosses - 0.05).floor).toEqual([]);
  });

  it('leaves motes of its light drifting for as long as its sound rings', () => {
    expect(stagedAt(cut, cast, 0.95).motes.length).toBeGreaterThan(0);
  });

  it('strikes from the south where no one casts it', () => {
    const body = crescentBodiesOf(stagedAt(cut, castOnTarget(false), hung)).at(-1)!;
    const ys = body.points.map((point) => point.y);

    expect(ys[0]).toBeGreaterThan(TARGET.y + CELL * 0.5);
    expect(ys[ys.length - 1]).toBeGreaterThan(TARGET.y + CELL * 0.5);
    expect(Math.min(...ys)).toBeLessThan(TARGET.y + CELL * 0.4);
  });
});

describe('a flurry of cuts', () => {
  const flurry = cutOf('combo', 2712);
  const blows = effectBlowsOf(flurry).map((blow) => blow.atMs / 1000);
  const opensAt = SLASH_COMBO_OPENS_AT * 2.712;

  it('comes quick and uneven, and leaves a breath before its last stroke', () => {
    const gaps = blows.slice(1).map((at, index) => at - blows[index]);

    expect(blows).toHaveLength(5);
    expect(Math.max(...gaps)).toBe(gaps[gaps.length - 1]);
    expect(new Set(gaps.map((gap) => gap.toFixed(3))).size).toBeGreaterThanOrEqual(3);
  });

  it('piles the crescents of all five strokes about the target until their cuts open', () => {
    const waiting = hotEdgesOf(stagedAt(flurry, cast, opensAt - 0.02));

    expect(waiting).toHaveLength(5);
    expect(hotEdgesOf(stagedAt(flurry, cast, opensAt + 0.5))).toEqual([]);
  });

  it('swings each stroke from its own side and paints each its own tint, the last the largest', () => {
    const drawn = stagedAt(flurry, cast, opensAt - 0.02);
    const edges = hotEdgesOf(drawn);
    const tints = new Set(crescentBodiesOf(drawn).map((body) => body.color));
    const bows = edges.map((edge) => {
      const chordX = (edge.points[0].x + edge.points.at(-1)!.x) / 2 - edge.points[MIDDLE].x;
      const chordY = (edge.points[0].y + edge.points.at(-1)!.y) / 2 - edge.points[MIDDLE].y;
      return Math.atan2(chordY, chordX);
    });

    expect(tints.size).toBeGreaterThanOrEqual(4);
    expect(new Set(bows.map((bow) => Math.round(bow * 4))).size).toBeGreaterThanOrEqual(4);
    expect(lengthOf(edges[4])).toBeGreaterThan(Math.max(...edges.slice(0, 4).map(lengthOf)) * 0.95);
    expect(widestOf(edges[4])).toBeGreaterThan(Math.max(...edges.slice(0, 4).map(widestOf)) * 1.3);
  });

  it('lifts the arcs off the level, no two alike, so they stand about the target', () => {
    const rises = hotEdgesOf(stagedAt(flurry, cast, opensAt - 0.02)).map((edge) => {
      const zs = edge.points.map((point) => point.z);
      return Math.max(...zs) - Math.min(...zs);
    });

    expect(Math.max(...rises)).toBeGreaterThan(CELL);
    expect(new Set(rises.map((rise) => Math.round(rise / (CELL * 0.2)))).size).toBeGreaterThanOrEqual(3);
  });

  it('leaves each cut waiting as a hair of light, then bursts all five open at once', () => {
    const waiting = stagedAt(flurry, cast, opensAt - 0.02);
    const opened = stagedAt(flurry, cast, opensAt + 0.15);
    const hairs = waiting.ribbons.filter((ribbon) => ribbon.points.length === 3 && ribbon.color === '#ffffff');

    expect(seamsOf(waiting)).toEqual([]);
    expect(hairs).toHaveLength(5);
    expect(seamsOf(opened)).toHaveLength(5);
    expect(Math.min(...seamsOf(opened).map(widestOf))).toBeGreaterThan(Math.max(...hairs.map(widestOf)) * 1.5);
    expect(opened.motes.filter((mote) => mote.shape === 'flare').length).toBeGreaterThan(10);
    expect(seamsOf(stagedAt(flurry, cast, opensAt + 0.9))).toEqual([]);
  });

  it('lays its cuts across the target each its own way, some of them steep', () => {
    const ways = seamsOf(stagedAt(flurry, cast, opensAt + 0.15)).map(wayOf);

    for (const [index, way] of ways.entries()) {
      for (const other of ways.slice(index + 1)) {
        expect(Math.abs(way.x * other.x + way.y * other.y + way.z * other.z)).toBeLessThan(0.95);
      }
    }
    expect(ways.filter((way) => Math.abs(way.z) > 0.6).length).toBeGreaterThanOrEqual(2);
  });

  it('fills the rest of its sound with drifting motes, and leaves nothing once it has lingered', () => {
    const late = stagedAt(flurry, cast, 2.5);
    const after = stagedAt(flurry, cast, 2.712 + 0.7);

    expect(late.motes.length).toBeGreaterThan(0);
    expect(late.ribbons).toEqual([]);
    expect(after.ribbons.length + after.motes.length + after.floor.length).toBe(0);
  });
});
