import { laserTimingOf } from '@axe/domain/effect/beam-looks';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { stageEffect } from '@axe/domain/effect/scene/effect-frame';

const CELL = 50;
/** How many points the beam itself is laid through. */
const LINE_POINTS = 12;

function laserOf(): EffectPreset {
  const preset = new EffectPreset('laser');
  preset.kind = 'raybeam';
  preset.grade = 2;
  preset.durationMs = 2038;
  preset.staggerMs = 0;
  preset.colorPrimary = '#ffffff';
  preset.colorSecondary = '#ff3b6b';
  return preset;
}

const cast: EffectCast = {
  presetIdentifier: 'laser',
  casterIdentifier: 'caster',
  origin: { x: 100, y: 300, z: 30 },
  targets: [{ identifier: 'target', x: 500, y: 300, z: 0 }],
  seed: 7,
};

function staged(preset: EffectPreset, ms: number): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, cast, ms, { cellPx: CELL }, drawn);
  return drawn;
}

/** Where the beam touches: the far end of its white heart. */
function touchOf(drawn: Staged): { x: number; y: number; z: number } | undefined {
  return drawn.ribbons.find(
    (ribbon) => ribbon.color === '#ffffff' && ribbon.blend === 'color' && ribbon.points.length === LINE_POINTS
  )?.points[LINE_POINTS - 1];
}

describe('a laser', () => {
  const preset = laserOf();
  const holds = effectBlowsOf(preset)[0].atMs;
  const timing = laserTimingOf(preset.duration / 1000, holds / 1000);

  it('aims a hairline at the floor short of its target before it lights', () => {
    const aiming = staged(preset, (timing.lightsAt * 1000) / 2);
    const widest = Math.max(...aiming.ribbons.map((ribbon) => ribbon.widths as number));

    expect(aiming.ribbons.length).toBeGreaterThan(0);
    expect(widest).toBeLessThan(CELL * 0.2);
    expect(touchOf(aiming)).toBeUndefined();
    expect(aiming.floor.some((mark) => mark.shape === 'ring' && mark.x < 500 - CELL)).toBe(true);
  });

  it('lights at once, long before it lands its blow, in a dark rim under a thin white heart', () => {
    const lit = staged(preset, timing.lightsAt * 1000 + 100);
    const bands = lit.ribbons.filter((ribbon) => ribbon.blend === 'color' && ribbon.points.length === LINE_POINTS);
    const widest = (widths: number | readonly number[]) => (typeof widths === 'number' ? widths : Math.max(...widths));

    expect(timing.lightsAt).toBeLessThan(0.2);
    expect(bands.at(-1)!.color).toBe('#ffffff');
    expect(widest(bands[1].widths) > widest(bands.at(-1)!.widths) * 5).toBe(true);
  });

  it('lights with a slam where it first touches the floor, and pops what it burnt as it is cut off', () => {
    const flashAt = (ms: number) =>
      Math.max(
        0,
        ...staged(preset, ms)
          .motes.filter((mote) => mote.shape === 'puff' && mote.color === '#ffffff')
          .map((mote) => mote.size)
      );

    expect(flashAt(timing.lightsAt * 1000 + 30)).toBeGreaterThan(CELL);
    expect(flashAt(timing.cutAt * 1000 + 30)).toBeGreaterThan(CELL);
    expect(flashAt(timing.cutAt * 1000 + 300)).toBe(0);
  });

  it('cuts its way along the floor towards its target, then climbs it and takes hold as its blow lands', () => {
    const touch = (ms: number) => touchOf(staged(preset, ms))!;
    const short = (ms: number) => 500 - touch(ms).x;

    expect(short(300)).toBeGreaterThan(short(600));
    expect(short(600)).toBeGreaterThan(short(850));
    expect(touch(300).z).toBeLessThan(CELL * 0.1);
    expect(touch(holds + 60).z).toBeGreaterThan(CELL * 0.4);
    expect(Math.abs(short(holds + 60))).toBeLessThan(CELL * 0.2);
  });

  it('leaves a cut along the floor behind it that glows, cools, and stays as soot', () => {
    const cut = (ms: number, glowing: boolean) =>
      staged(preset, ms).floor.filter(
        (mark) =>
          mark.shape === 'disc' && mark.blend === 'color' && mark.x < 480 && (mark.color === '#0e0b10') !== glowing
      );

    expect(cut(700, false).length).toBeGreaterThan(cut(400, false).length);
    expect(cut(700, true).length).toBeGreaterThan(0);
    expect(cut(preset.duration + 1000, true)).toEqual([]);
    expect(cut(preset.duration + 700, false).length).toBeGreaterThan(8);
  });

  it('throws sparks and smoke off what it touches for as long as it burns', () => {
    const boiling = (ms: number) => {
      const drawn = staged(preset, ms);
      return {
        sparks: drawn.motes.filter((mote) => mote.shape === 'spark').length,
        smoke: drawn.motes.filter((mote) => mote.shape === 'smoke').length,
      };
    };

    expect(boiling(600).sparks).toBeGreaterThan(20);
    expect(boiling(600).smoke).toBeGreaterThan(3);
    expect(boiling(holds + 300).sparks).toBeGreaterThan(boiling(600).sparks);
  });

  it('thins as it is cut off, hangs in the air for a moment as a line, and is gone', () => {
    const heart = (ms: number) =>
      staged(preset, ms).ribbons.find(
        (ribbon) => ribbon.color === '#ffffff' && ribbon.blend === 'color' && ribbon.points.length === LINE_POINTS
      );
    const cutting = (timing.breaksAt + timing.cutAt) * 500;

    expect(heart(cutting)!.widths as number).toBeLessThan((heart(holds + 300)!.widths as number) * 0.8);
    expect(heart(timing.cutAt * 1000 + 50)).toBeUndefined();
    expect(staged(preset, timing.cutAt * 1000 + 50).ribbons.length).toBeGreaterThan(0);
    expect(staged(preset, timing.cutAt * 1000 + 500).ribbons).toEqual([]);
  });
});
