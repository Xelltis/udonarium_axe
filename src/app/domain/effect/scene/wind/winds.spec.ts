import { ObjectStore } from '@axe/core/sync/object-store';
import { hexChannels } from '@axe/core/util/hex-color';
import { createEffectPreset, DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectJoltsOf } from '@axe/domain/effect/effect-reaction';
import { effectShakeOf } from '@axe/domain/effect/effect-shake';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { sceneLingerMsOf } from '@axe/domain/effect/scene/scene-kinds';
import { slashHits } from '@axe/domain/effect/timeline/blade';
import { projectileTiming } from '@axe/domain/effect/timeline/flight-timing';

const CELL = 50;

function bundled(name: string): EffectPreset {
  return createEffectPreset(DEFAULT_EFFECT_PRESET_SEEDS.find((seed) => seed.name === name)!);
}

function drawnAt(preset: EffectPreset, cast: EffectCast, ms: number): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, cast, ms, { cellPx: CELL }, drawn);
  return drawn;
}

function castOn(...targets: readonly (readonly [number, number])[]): EffectCast {
  return {
    presetIdentifier: 'wind',
    casterIdentifier: 'caster',
    origin: { x: 0, y: 300, z: 30 },
    targets: targets.map(([x, y], index) => ({ identifier: `t${index}`, x, y, z: 0 })),
    seed: 5,
  };
}

/** The bands of a bolt of lightning that strikes the floor: long jagged lines of many points, white at their heart, ending low. */
function bolts(drawn: Staged) {
  return drawn.ribbons.filter(
    (ribbon) => ribbon.points.length > 20 && ribbon.color === '#ffffff' && ribbon.points.at(-1)!.z < CELL * 0.5
  );
}

describe('a storm', () => {
  it('strikes each piece it has caught with lightning out of its cloud, one stroke after another', () => {
    const preset = bundled('大嵐');
    const cast = castOn([400, 300], [470, 330], [350, 360]);
    try {
      const strokes = effectBlowsOf(preset).map((blow) => blow.atMs);
      expect(strokes).toHaveLength(3);
      const struck = strokes.map((at) => bolts(drawnAt(preset, cast, at + 30)));
      const ends = struck.map((lines) => lines.map((line) => line.points.at(-1)!));

      for (const [index, target] of cast.targets.entries()) {
        const hit = ends.some((points) => points.some((end) => Math.hypot(end.x - target.x, end.y - target.y) < CELL));
        expect([index, hit]).toEqual([index, true]);
      }
      expect(bolts(drawnAt(preset, cast, strokes[0] - 200))).toEqual([]);
      expect(effectShakeOf(preset)).toBe('hard');
    } finally {
      ObjectStore.instance.remove(preset);
    }
  });

  it('lifts every piece it has caught off the floor and whirls it round, where a tornado drags them in', () => {
    const preset = bundled('大嵐');
    const cast = castOn([400, 300], [470, 330]);
    try {
      const jolts = effectJoltsOf(preset, cast, 1300, CELL);

      expect(jolts.get('t0')!.z).toBeGreaterThan(CELL * 0.1);
      expect(jolts.get('t1')!.z).toBeGreaterThan(CELL * 0.1);
    } finally {
      ObjectStore.instance.remove(preset);
    }
  });
});

describe('a storm and a tornado', () => {
  /** The shadow sheet of a funnel's body: the widest band laid just before the first band set to one side. */
  function funnelSheathOf(drawn: Staged) {
    const lit = drawn.ribbons.findIndex((ribbon) => ribbon.leans !== undefined);
    return drawn.ribbons[lit - 1];
  }

  function lightness(color: string): number {
    const [red, green, blue] = hexChannels(color)!;
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  }

  it('stands the funnel of a storm clearly larger and darker than a tornado', () => {
    const storm = bundled('大嵐');
    const tornado = bundled('竜巻');
    const cast = castOn([400, 300]);
    try {
      const big = funnelSheathOf(drawnAt(storm, cast, 1500));
      const small = funnelSheathOf(drawnAt(tornado, cast, 1500));
      const widest = (ribbon: typeof big) => Math.max(...(ribbon.widths as number[]));

      expect(widest(big)).toBeGreaterThan(widest(small) * 1.15);
      expect(lightness(big.color)).toBeLessThan(lightness(small.color));
    } finally {
      ObjectStore.instance.remove(storm);
      ObjectStore.instance.remove(tornado);
    }
  });
});

describe('a great sword of wind', () => {
  it('corkscrews a few thick sheathed bands along its torrent, with few lines of speed among them', () => {
    const preset = bundled('風の大剣');
    const cast = castOn([500, 300]);
    try {
      const flowing = drawnAt(preset, cast, effectBlowsOf(preset)[0].atMs + 250);
      const bands = flowing.ribbons.filter((ribbon) => ribbon.half === 'near' && ribbon.points.length >= 30);
      const lines = flowing.ribbons.filter(
        (ribbon) =>
          ribbon.points.length === 3 &&
          ribbon.color === '#ffffff' &&
          ribbon.core === undefined &&
          (ribbon.widths as number[])[0] === 0
      );

      expect(bands.length).toBeGreaterThan(0);
      expect(bands.length).toBeLessThanOrEqual(6);
      expect(bands.some((band) => band.core === undefined && band.color !== '#ffffff')).toBe(true);
      expect(lines.length).toBeLessThanOrEqual(6);
    } finally {
      ObjectStore.instance.remove(preset);
    }
  });
});

describe('sickles of wind', () => {
  it('leave a cut hanging through the target for every stroke the form of the cut makes', () => {
    const preset = bundled('鎌鼬');
    const cast = castOn([200, 300]);
    try {
      const hits = slashHits(preset.slashLook);
      const last = Math.max(...hits.map((hit) => (hit.at + hit.span * 0.3) * preset.duration));
      const hanging = drawnAt(preset, cast, last + 100).ribbons.filter(
        (ribbon) => ribbon.points.length === 2 && ribbon.color === '#ffffff'
      );

      expect(hanging).toHaveLength(hits.length * 2);
    } finally {
      ObjectStore.instance.remove(preset);
    }
  });
});

describe('a wave of the void', () => {
  it('bursts where it lands in a ring of wind about the target, its far half behind the piece and its near half before it', () => {
    const preset = bundled('真空波');
    const cast = castOn([300, 300]);
    try {
      const landsAt = projectileTiming(preset).shots[0].land * preset.duration;
      const drawn = drawnAt(preset, cast, landsAt + 200);
      const ring = drawn.ribbons.filter((ribbon) => ribbon.points.length > 25 && ribbon.half !== undefined);

      expect(ring.some((ribbon) => ribbon.half === 'far')).toBe(true);
      expect(ring.some((ribbon) => ribbon.half === 'near')).toBe(true);
      expect(
        ring.every((ribbon) =>
          ribbon.points.every(
            (point) =>
              Math.abs(
                Math.hypot(point.x - 300, point.y - 300) -
                  Math.hypot(ribbon.points[0].x - 300, ribbon.points[0].y - 300)
              ) < 1
          )
        )
      ).toBe(true);
    } finally {
      ObjectStore.instance.remove(preset);
    }
  });

  it('goes on slicing at its target in a low gale of blades while its landing sounds, and has settled before it clears', () => {
    const preset = bundled('真空波');
    const cast = castOn([300, 300]);
    try {
      const landsAt = projectileTiming(preset).shots[0].land * preset.duration;
      const ends = preset.duration + sceneLingerMsOf(preset);
      const whirling = drawnAt(preset, cast, landsAt + 1200);
      const blades = whirling.ribbons.filter((ribbon) => ribbon.half !== undefined);
      const cuts = whirling.ribbons.filter((ribbon) => ribbon.points.length === 5 && ribbon.color === '#ffffff');

      expect(blades.length).toBeGreaterThan(8);
      expect(cuts.length).toBeGreaterThan(0);
      for (const point of blades.flatMap((ribbon) => ribbon.points)) {
        expect(Math.hypot(point.x - 300, point.y - 300)).toBeLessThan(CELL * 3);
        expect(point.z).toBeLessThan(CELL * 4);
      }
      expect(drawnAt(preset, cast, ends - 200).ribbons.filter((ribbon) => ribbon.half !== undefined)).toEqual([]);
    } finally {
      ObjectStore.instance.remove(preset);
    }
  });
});
