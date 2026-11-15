import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { SLASH_COMBO_OPENS_AT } from '@axe/domain/effect/timeline/blade';
import {
  CASTER,
  castOnTarget,
  CELL,
  cutOf,
  hardEdgesOf,
  stagedAt,
  TARGET,
  wakesOf,
  widestOf,
} from '@axe/testing/blade-effect-stage';

const cast = castOnTarget();
const TRAIL_POINTS = 21;
const CUT_POINTS = 9;

/** The hard edge of the trail a stroke leaves, or none. */
function trailEdgeOf(drawn: Staged): EffectRibbon | undefined {
  return hardEdgesOf(drawn).find((ribbon) => ribbon.points.length === TRAIL_POINTS);
}

/** The slits of the cuts left on the target: the light-cored bands laid straight through it. */
function slitsOf(drawn: Staged): EffectRibbon[] {
  return drawn.ribbons.filter((ribbon) => ribbon.points.length === CUT_POINTS && ribbon.core === '#ffffff');
}

/** The way a straight band runs over the floor, of length one. */
function wayOf(ribbon: EffectRibbon): { x: number; y: number } {
  const from = ribbon.points[0];
  const to = ribbon.points[ribbon.points.length - 1];
  const far = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: (to.x - from.x) / far, y: (to.y - from.y) / far };
}

describe('one stroke of a cut', () => {
  const cut = cutOf('single', 1000);
  const crosses = effectBlowsOf(cut)[0].atMs / 1000;

  it('glints where the blade is drawn back, before anything swings', () => {
    const before = stagedAt(cut, cast, crosses - 0.09);

    expect(before.ribbons).toEqual([]);
    expect(before.motes.some((mote) => mote.shape === 'star')).toBe(true);
  });

  it('is just through the target as its blow lands, and swings on past it', () => {
    const head = (seconds: number) => trailEdgeOf(stagedAt(cut, cast, seconds))!.points.at(-1)!;
    const landing = head(crosses);

    expect(Math.hypot(landing.x - TARGET.x, landing.y - TARGET.y)).toBeLessThan(CELL * 0.5);
    expect(Math.abs(head(crosses + 0.12).y - TARGET.y)).toBeGreaterThan(CELL);
  });

  it('swings its arc about its caster, through the target, not round it', () => {
    const edge = trailEdgeOf(stagedAt(cut, cast, crosses + 0.12))!;
    const xs = edge.points.map((point) => point.x);

    expect(Math.min(...xs)).toBeGreaterThan(TARGET.x - 2);
    expect(Math.min(...xs)).toBeLessThan(TARGET.x + CELL * 0.2);
    expect(xs[0]).toBeGreaterThan(TARGET.x + CELL * 0.4);
    expect(xs[xs.length - 1]).toBeGreaterThan(TARGET.x + CELL * 0.4);
  });

  it('leaves a hard edge on the arc and a torn wake inside it, towards the caster', () => {
    const drawn = stagedAt(cut, cast, crosses + 0.1);
    const edge = trailEdgeOf(drawn)!;
    const [wake] = wakesOf(drawn);
    const middle = Math.floor(TRAIL_POINTS / 2);

    expect(widestOf(wake)).toBeGreaterThan(widestOf(edge) * 3);
    expect(wake.points[middle].x).toBeGreaterThan(edge.points[middle].x);
    expect(Math.abs(wake.points[middle].x - CASTER.x)).toBeLessThan(Math.abs(edge.points[middle].x - CASTER.x));
  });

  it('draws the trail to a point at both ends, widest behind the blade', () => {
    const widths = trailEdgeOf(stagedAt(cut, cast, crosses + 0.1))!.widths as number[];
    const widest = widths.indexOf(Math.max(...widths));

    expect(widths[0]).toBeLessThan(Math.max(...widths) * 0.1);
    expect(widths[widths.length - 1]).toBeLessThan(Math.max(...widths) * 0.1);
    expect(widest).toBeGreaterThan(widths.length / 2);
  });

  it('lets the trail hang once the blade has passed, drawing in to its edge and fading', () => {
    const wakeAt = (seconds: number) => wakesOf(stagedAt(cut, cast, seconds))[0];
    const fresh = wakeAt(crosses + 0.15);
    const fading = wakeAt(crosses + 0.3);

    expect(fading.points.at(-1)!.x).toBeCloseTo(fresh.points.at(-1)!.x, 3);
    expect(fading.points.at(-1)!.y).toBeCloseTo(fresh.points.at(-1)!.y, 3);
    expect(fading.alpha).toBeLessThan(fresh.alpha);
    expect(widestOf(fading)).toBeLessThan(widestOf(fresh));
    expect(wakesOf(stagedAt(cut, cast, crosses + 0.6))).toEqual([]);
  });

  it('leaves a cut across the target along the way the blade went, which closes', () => {
    const slitAt = (seconds: number) => slitsOf(stagedAt(cut, cast, seconds))[0];
    const open = slitAt(crosses + 0.05);
    const closing = slitAt(crosses + 0.4);
    const middle = open.points[Math.floor(CUT_POINTS / 2)];

    expect(Math.hypot(middle.x - TARGET.x, middle.y - TARGET.y)).toBeLessThan(1);
    expect(Math.abs(wayOf(open).y)).toBeGreaterThan(0.9);
    expect(widestOf(closing)).toBeLessThan(widestOf(open));
    expect(slitsOf(stagedAt(cut, cast, crosses + 0.7))).toEqual([]);
  });

  it('throws its sparks the way the blade was going', () => {
    const edge = trailEdgeOf(stagedAt(cut, cast, crosses + 0.12))!;
    const going = Math.sign(edge.points.at(-1)!.y - edge.points[0].y);
    const sparks = stagedAt(cut, cast, crosses + 0.06).motes.filter((mote) => mote.shape === 'spark');
    const along = sparks.reduce((sum, spark) => sum + (spark.velocity?.y ?? 0) * going, 0) / sparks.length;

    expect(sparks.length).toBeGreaterThan(8);
    expect(along).toBeGreaterThan(CELL * 2);
  });

  it('strikes from the south where no one casts it', () => {
    const edge = trailEdgeOf(stagedAt(cut, castOnTarget(false), crosses + 0.12))!;
    const ys = edge.points.map((point) => point.y);

    expect(Math.max(...ys)).toBeGreaterThan(TARGET.y + CELL * 0.4);
    expect(Math.min(...ys)).toBeGreaterThan(TARGET.y - CELL * 0.2);
  });
});

describe('a flurry of cuts', () => {
  const flurry = cutOf('combo', 2712);
  const blows = effectBlowsOf(flurry).map((blow) => blow.atMs / 1000);
  const opensAt = SLASH_COMBO_OPENS_AT * 2.712;

  it('cuts five times, no two strokes from the same side', () => {
    const ways = slitsOf(stagedAt(flurry, cast, opensAt - 0.02)).map(wayOf);

    expect(ways).toHaveLength(5);
    for (const [index, way] of ways.entries()) {
      for (const other of ways.slice(index + 1)) {
        expect(Math.abs(way.x * other.x + way.y * other.y)).toBeLessThan(0.9);
      }
    }
  });

  it('comes quick and uneven, and leaves a breath before its last and heaviest stroke', () => {
    const gaps = blows.slice(1).map((at, index) => at - blows[index]);

    expect(Math.max(...gaps)).toBe(gaps[gaps.length - 1]);
    expect(new Set(gaps.map((gap) => gap.toFixed(3))).size).toBeGreaterThanOrEqual(3);
    const trailOf = (index: number) =>
      wakesOf(stagedAt(flurry, cast, blows[index] + 0.04)).filter((wake) => wake.alpha > 0.8)[0];
    expect(widestOf(trailOf(4))).toBeGreaterThan(widestOf(trailOf(1)) * 1.3);
  });

  it('keeps every cut on the target until they open together, wider than any was', () => {
    const waiting = slitsOf(stagedAt(flurry, cast, opensAt - 0.02));
    const opened = slitsOf(stagedAt(flurry, cast, opensAt + 0.03));

    expect(waiting).toHaveLength(5);
    expect(opened).toHaveLength(5);
    expect(Math.min(...opened.map(widestOf))).toBeGreaterThan(Math.max(...waiting.map(widestOf)));
    expect(slitsOf(stagedAt(flurry, cast, opensAt + 0.9))).toEqual([]);
  });

  it('is over while its sound still rings: nothing is left well before its playback ends', () => {
    const late = stagedAt(flurry, cast, 2.5);

    expect(late.ribbons.length + late.motes.length).toBe(0);
  });
});

describe('a drawing cut', () => {
  const iai = cutOf('iai', 2612);
  const opensAt = effectBlowsOf(iai)[0].atMs / 1000;
  /** The line: the long thin edge lying level through the target. */
  const lineOf = (drawn: Staged) =>
    drawn.ribbons.find(
      (ribbon) => ribbon.points.length === 15 && ribbon.core === '#ffffff' && ribbon.blend === 'color'
    );

  it('draws its line within the first moments, long before its blow', () => {
    expect(lineOf(stagedAt(iai, cast, 0.05))).toBeUndefined();
    expect(lineOf(stagedAt(iai, cast, 0.2))).toBeDefined();
    expect(opensAt).toBeGreaterThan(0.9);
  });

  it('lays the line from behind its caster through the target and a little past it, level', () => {
    const line = lineOf(stagedAt(iai, cast, 0.3))!;
    const xs = line.points.map((point) => point.x);
    const zs = line.points.map((point) => point.z);

    expect(Math.max(...xs)).toBeGreaterThan(CASTER.x);
    expect(Math.min(...xs)).toBeLessThan(TARGET.x - CELL);
    expect(Math.min(...xs)).toBeGreaterThan(TARGET.x - CELL * 3);
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(1);
    expect(line.points.every((point) => Math.abs(point.y - TARGET.y) < 1)).toBe(true);
  });

  it('thins the line to a hair that lies still until the cut opens', () => {
    const flashing = widestOf(lineOf(stagedAt(iai, cast, 0.16))!);
    const lying = widestOf(lineOf(stagedAt(iai, cast, 0.6))!);
    const later = widestOf(lineOf(stagedAt(iai, cast, opensAt - 0.05))!);

    expect(lying).toBeLessThan(flashing * 0.5);
    expect(lying).toBeLessThan(CELL * 0.08);
    expect(later).toBe(lying);
  });

  it('darkens the floor about the target while the line waits, and clears it as the cut opens', () => {
    const hushOf = (seconds: number) =>
      stagedAt(iai, cast, seconds).floor.find((mark) => mark.shape === 'disc' && mark.blend === 'color');

    expect(hushOf(0.5)!.alpha).toBeGreaterThan(0.4);
    expect(hushOf(0.5)!.radius).toBeGreaterThan(CELL * 3);
    expect(hushOf(opensAt + 0.3)).toBeUndefined();
  });

  it('opens the cut as its blow lands: the hair parts in two about the target and light pours out', () => {
    const before = stagedAt(iai, cast, opensAt - 0.03);
    const opened = stagedAt(iai, cast, opensAt + 0.15);
    const edges = hardEdgesOf(opened).length + opened.ribbons.filter((ribbon) => ribbon.core === '#ffffff').length;
    const heights = opened.ribbons
      .filter((ribbon) => ribbon.core === '#ffffff' && widestOf(ribbon) < CELL * 0.2)
      .map((ribbon) => ribbon.points[7].z);

    expect(before.motes.filter((mote) => mote.shape === 'spark')).toEqual([]);
    expect(edges).toBeGreaterThan(2);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(CELL * 0.2);
    expect(opened.motes.filter((mote) => mote.shape === 'spark').length).toBeGreaterThan(20);
  });

  it('throws its sparks both ways along the line', () => {
    const sparks = stagedAt(iai, cast, opensAt + 0.08).motes.filter((mote) => mote.shape === 'spark');

    expect(sparks.some((spark) => (spark.velocity?.x ?? 0) > CELL * 2)).toBe(true);
    expect(sparks.some((spark) => (spark.velocity?.x ?? 0) < -CELL * 2)).toBe(true);
  });

  it('leaves petals of light falling where the line was', () => {
    const petalsAt = (seconds: number) =>
      stagedAt(iai, cast, seconds).motes.filter((mote) => mote.shape === 'flake' && mote.blend === 'light');
    const lowest = (seconds: number) => Math.min(...petalsAt(seconds).map((petal) => petal.z));

    expect(petalsAt(opensAt + 0.5).length).toBeGreaterThan(8);
    expect(lowest(opensAt + 1)).toBeLessThan(lowest(opensAt + 0.4));
  });
});

describe('every form of a cut', () => {
  it.each(['single', 'combo', 'iai', 'wide', 'heavy'] as const)(
    'keeps every blade of a %s cut over the floor, and only its dust on it',
    (style) => {
      const cut = cutOf(style, 2500, 3);
      for (let at = 0; at < 3.2; at += 0.025) {
        for (const ribbon of stagedAt(cut, cast, at).ribbons) {
          const dust = ribbon.points.every((point) => point.z < CELL * 0.1);
          expect(dust || ribbon.points.every((point) => point.z >= CELL * 0.1)).toBe(true);
          if (dust) expect(style).toBe('wide');
        }
      }
    }
  );

  it.each(['single', 'combo', 'iai', 'wide', 'heavy'] as const)(
    'draws a %s cut the same whoever looks, and nothing once it has lingered',
    (style) => {
      const cut = cutOf(style, 2000, 3);

      expect(stagedAt(cut, cast, 0.9)).toEqual(stagedAt(cut, cast, 0.9));
      const after = stagedAt(cut, cast, 5);
      expect(after.ribbons.length + after.motes.length + after.floor.length).toBe(0);
    }
  );
});
