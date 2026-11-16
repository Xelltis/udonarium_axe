import { hexChannels } from '@axe/core/util/hex-color';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { sceneLingerMsOf, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { EFFECT_FRAME_BUDGET, type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { tornadoTimingOf } from '@axe/domain/effect/wind-looks';

const CELL = 50;
const CENTRE = { x: 500, y: 300 };
const CAUGHT = { x: 600, y: 300 };

function tornadoOf(fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'vortex';
  preset.grade = 3;
  preset.durationMs = 3318;
  preset.staggerMs = 90;
  preset.targeting = 'multi';
  preset.areaRadius = 3;
  preset.colorPrimary = '#f2fbff';
  preset.colorSecondary = '#8aa6b8';
  Object.assign(preset, fields);
  return preset;
}

function castOn(points: { x: number; y: number }[]): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: '',
    origin: null,
    targets: points.map((point, index) => ({ identifier: `t${index}`, ...point, z: 0 })),
    seed: 11,
  };
}

function staged(preset: EffectPreset, cast: EffectCast, elapsedMs: number): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, cast, elapsedMs, { cellPx: CELL }, drawn);
  return drawn;
}

/** The sheets of the funnel's body: the bands set to one side, and the shadow laid before them. */
function bodyOf(drawn: Staged): EffectRibbon[] {
  const lit = drawn.ribbons.filter((ribbon) => ribbon.leans !== undefined);
  return lit.length > 0
    ? drawn.ribbons.slice(drawn.ribbons.indexOf(lit[0]) - 1, drawn.ribbons.indexOf(lit.at(-1)!) + 1)
    : [];
}

/** How high the top of the funnel stands, and how high its foot. */
function standsOf(drawn: Staged): { top: number; foot: number; wideAtTop: number; wideAtFoot: number } {
  const [shadow] = bodyOf(drawn);
  const widths = shadow.widths as number[];
  return { top: shadow.points.at(-1)!.z, foot: shadow.points[0].z, wideAtTop: widths.at(-1)!, wideAtFoot: widths[0] };
}

/** The things the funnel carries: bands of three points drawn by halves. */
function carriedOf(drawn: Staged): EffectRibbon[] {
  return drawn.ribbons.filter((ribbon) => ribbon.points.length === 3 && ribbon.half === 'near');
}

describe('a tornado', () => {
  const timing = tornadoTimingOf(3.318);

  it('rises out of a swirl on the ground in half a second, then stands as tall as it is', () => {
    const tornado = tornadoOf();
    const cast = castOn([CENTRE]);
    const early = staged(tornado, cast, 60);

    expect(early.floor.length).toBeGreaterThan(0);
    expect(standsOf(staged(tornado, cast, 150)).top).toBeLessThan(standsOf(staged(tornado, cast, 300)).top);
    expect(standsOf(staged(tornado, cast, 500)).top).toBeCloseTo(standsOf(staged(tornado, cast, 1500)).top, 0);
    expect(standsOf(staged(tornado, cast, 1500)).top).toBeGreaterThan(CELL * 5);
  });

  it('sheathes its body in a slate dark enough to hold over a bright table', () => {
    const [sheath] = bodyOf(staged(tornadoOf(), castOn([CENTRE]), 1500));
    const [red, green, blue] = hexChannels(sheath.color)!;

    expect(sheath.alpha).toBeGreaterThanOrEqual(0.8);
    expect((0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255).toBeLessThan(0.25);
    expect(Math.max(...(sheath.widths as number[]))).toBeGreaterThan(CELL * 3.5);
  });

  it('is a funnel: narrow where it grinds at the floor and many times wider under its crown', () => {
    const standing = standsOf(staged(tornadoOf(), castOn([CENTRE]), 1500));

    expect(standing.wideAtFoot).toBeLessThan(CELL * 1.5);
    expect(standing.wideAtTop).toBeGreaterThan(standing.wideAtFoot * 4);
  });

  it('writhes: its axis is not where it was a moment ago, though its foot keeps to the target', () => {
    const tornado = tornadoOf();
    const cast = castOn([CENTRE]);
    const [now] = bodyOf(staged(tornado, cast, 1500));
    const [then] = bodyOf(staged(tornado, cast, 1900));
    const top = now.points.length - 1;

    expect(Math.hypot(now.points[top].x - then.points[top].x, now.points[top].y - then.points[top].y)).toBeGreaterThan(
      CELL * 0.2
    );
    expect(Math.hypot(now.points[0].x - CENTRE.x, now.points[0].y - CENTRE.y)).toBeLessThan(CELL * 0.4);
  });

  it('lays the far half of everything that winds round it before its body and the near half after', () => {
    const drawn = staged(tornadoOf(), castOn([CENTRE]), 1500);
    const body = bodyOf(drawn);
    const first = drawn.ribbons.indexOf(body[0]);
    const last = drawn.ribbons.indexOf(body.at(-1)!);
    const far = drawn.ribbons.filter((ribbon) => ribbon.half === 'far');
    const near = drawn.ribbons.filter((ribbon) => ribbon.half === 'near');

    expect(body).toHaveLength(3);
    expect(far.length).toBeGreaterThan(40);
    expect(near).toHaveLength(far.length);
    for (const ribbon of far) expect(drawn.ribbons.indexOf(ribbon)).toBeLessThan(first);
    for (const ribbon of near) expect(drawn.ribbons.indexOf(ribbon)).toBeGreaterThan(last);
    for (const ribbon of [...far, ...near]) expect(ribbon.about).toHaveLength(ribbon.points.length);
  });

  it('winds many bands of wind round it, each bright at its head and fading to nothing at its tail', () => {
    const drawn = staged(tornadoOf(), castOn([CENTRE]), 1500);
    const wound = drawn.ribbons.filter((ribbon) => ribbon.half === 'near' && ribbon.points.length === 11);
    const bands = wound.filter((ribbon) => ribbon.core === '#ffffff');

    expect(bands.length).toBeGreaterThanOrEqual(36);
    expect(wound.length - bands.length).toBeGreaterThanOrEqual(10);
    expect(drawn.ribbons.indexOf(wound.find((ribbon) => !ribbon.core)!)).toBeLessThan(drawn.ribbons.indexOf(bands[0]));
    for (const band of bands) {
      expect(band.alphas![0]).toBe(0);
      expect(band.alphas!.at(-1)).toBe(1);
      expect(band.points.at(-1)!.z).toBeGreaterThanOrEqual(band.points[0].z);
    }
  });

  it('takes things in along the floor, up the funnel and out off its top', () => {
    const tornado = tornadoOf();
    const cast = castOn([CENTRE]);
    const heights = new Set<string>();
    let furthestOut = 0;
    for (let ms = 400; ms < 3000; ms += 100) {
      for (const thing of carriedOf(staged(tornado, cast, ms))) {
        const at = thing.points[1];
        const out = Math.hypot(at.x - CENTRE.x, at.y - CENTRE.y);
        heights.add(at.z < CELL * 0.3 ? 'floor' : at.z > CELL * 3.5 ? 'high' : 'climbing');
        if (at.z > CELL) furthestOut = Math.max(furthestOut, out);
      }
    }

    expect([...heights].sort()).toEqual(['climbing', 'floor', 'high']);
    expect(furthestOut).toBeGreaterThan(CELL * 3);
  });

  it('carries more at the higher grade', () => {
    const cast = castOn([CENTRE]);
    const most = (grade: number) =>
      Math.max(...[1200, 1600, 2000].map((ms) => carriedOf(staged(tornadoOf({ grade }), cast, ms)).length));

    expect(most(3)).toBeGreaterThan(most(2));
    expect(most(3)).toBeGreaterThan(50);
  });

  it('thins as it goes and lifts off the ground, and what it threw out falls after it is gone', () => {
    const tornado = tornadoOf();
    const cast = castOn([CENTRE]);
    const standing = standsOf(staged(tornado, cast, 1500));
    const going = standsOf(staged(tornado, cast, (timing.thinsAt + 0.45) * 1000));
    const gone = staged(tornado, cast, (timing.goneAt + 0.05) * 1000);

    expect(going.wideAtTop).toBeLessThan(standing.wideAtTop * 0.6);
    expect(going.foot).toBeGreaterThan(standing.foot + CELL * 0.5);
    expect(bodyOf(gone)).toEqual([]);
    expect(carriedOf(gone).length).toBeGreaterThan(0);
  });

  it('leaves nothing as its lingering ends', () => {
    const tornado = tornadoOf();
    const last = staged(tornado, castOn([CENTRE]), tornado.duration + sceneLingerMsOf(tornado) - 5);

    expect(carriedOf(last).every((thing) => thing.alpha < 0.5)).toBe(true);
    expect(bodyOf(last)).toEqual([]);
    expect(last.motes).toEqual([]);
    expect(last.floor).toEqual([]);
  });

  it('stands one funnel at the first target, and tears the dust at the feet of the rest towards it', () => {
    const tornado = tornadoOf();
    const drawn = staged(tornado, castOn([CENTRE, CAUGHT]), 1500);
    const alone = staged(tornado, castOn([CENTRE]), 1500);
    const added = drawn.motes.slice(alone.motes.length).filter((mote) => mote.shape === 'wisp');

    expect(bodyOf(drawn)).toHaveLength(3);
    expect(added.length).toBeGreaterThan(4);
    for (const shred of added) {
      expect(shred.velocity!.x).toBeLessThan(0);
      expect(Math.hypot(shred.x - CAUGHT.x, shred.y - CAUGHT.y)).toBeLessThan(CELL * 3);
    }
  });

  it('lays every part of itself in the air as colour, so it shows on a bright table', () => {
    const tornado = tornadoOf();
    const cast = castOn([CENTRE, CAUGHT]);
    for (let ms = 0; ms < 4100; ms += 100) {
      const drawn = staged(tornado, cast, ms);
      expect(drawn.motes.every((mote) => mote.blend === 'color')).toBe(true);
      expect(drawn.ribbons.every((ribbon) => ribbon.blend === 'color')).toBe(true);
    }
  });

  it('keeps one cast at the highest grade within two thirds of what the scene draws in a frame', () => {
    const tornado = tornadoOf();
    const cast = castOn([CENTRE, CAUGHT, { x: 400, y: 350 }, { x: 520, y: 420 }]);
    for (let ms = 0; ms < 4200; ms += 40) {
      const drawn = staged(tornado, cast, ms);
      expect(drawn.motes.length).toBeLessThan(EFFECT_FRAME_BUDGET.motes / 4);
      expect(drawn.ribbons.reduce((sum, ribbon) => sum + ribbon.points.length, 0)).toBeLessThan(
        (EFFECT_FRAME_BUDGET.ribbonPoints * 2) / 3
      );
      expect(drawn.floor.length).toBeLessThan(EFFECT_FRAME_BUDGET.marks / 8);
    }
  });
});
