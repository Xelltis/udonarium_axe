import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { sceneLingerMsOf, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { arrowRainShots } from '@axe/domain/effect/timeline/flight-timing';

const CELL = 50;
const FEATHER = '#f2ece0';
const SHADE = '#0c1422';
const SHAFT = '#7a5532';
const TARGET = { x: 600, y: 300 };

function rainOf(): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'arrowrain';
  preset.grade = 3;
  preset.durationMs = 2400;
  preset.staggerMs = 0;
  return preset;
}

function castOn(count: number): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: 'caster',
    origin: { x: 100, y: 300, z: 30 },
    targets: Array.from({ length: count }, (_unused, index) => ({
      identifier: `t${index}`,
      x: TARGET.x,
      y: TARGET.y + index * 200,
      z: 0,
    })),
    seed: 7,
  };
}

function staged(ms: number, count = 1): Staged {
  const drawn = nothingStaged();
  stageEffect(rainOf(), castOn(count), ms, { cellPx: CELL }, drawn);
  return drawn;
}

/** The arrows standing in the ground: their feathers, where they are over the floor and no higher than an arrow is long. */
const standing = (drawn: Staged) =>
  drawn.ribbons.filter((ribbon) => ribbon.color === FEATHER && ribbon.points[0].z < CELL * 2 && ribbon.alpha > 0.01);

describe('a rain of arrows', () => {
  it('falls in a wave from the side of its caster to the far side', () => {
    const lands = arrowRainShots().map((shot) => shot.land * 2400);
    const early = standing(staged(lands[8])).map((ribbon) => ribbon.points[0].x);
    const all = standing(staged(2500)).map((ribbon) => ribbon.points[0].x);
    const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

    expect(early.length).toBeGreaterThan(4);
    expect(mean(early)).toBeLessThan(mean(all) - CELL * 0.2);
  });

  it('darkens the ground under the volley while it falls, and closes the shadow of each arrow to where it will strike', () => {
    const falling = staged(1300);
    const shades = falling.floor.filter((mark) => mark.color === SHADE);

    expect(shades.some((mark) => mark.radius > CELL * 2)).toBe(true);
    expect(shades.filter((mark) => mark.radius < CELL).length).toBeGreaterThan(2);
    expect(staged(3000).floor.filter((mark) => mark.color === SHADE)).toHaveLength(0);
  });

  it('leaves its arrows standing after the playback, and takes them away one by one, not together', () => {
    const ends = 2400 + sceneLingerMsOf(rainOf());
    const counts = [ends - 800, ends - 350, ends - 200, ends - 100, ends - 10].map((ms) => standing(staged(ms)).length);

    expect(counts[0]).toBe(36);
    expect(counts[1]).toBeLessThan(counts[0]);
    expect(counts[2]).toBeLessThan(counts[1]);
    expect(counts[3]).toBeLessThan(counts[2]);
    expect(counts[4]).toBe(0);
  });

  it('falls each arrow with a second beside it on few targets, and alone on many, leaving one standing for each', () => {
    const lands = arrowRainShots().map((shot) => shot.land * 2400);
    const fallingOver = (count: number): number =>
      [lands[5], lands[12], lands[20], lands[28]]
        .map((ms) =>
          staged(ms - 30, count).ribbons.filter((ribbon) => ribbon.color === FEATHER && ribbon.points[0].z > CELL * 2)
        )
        .reduce((sum, falling) => sum + falling.length, 0);

    expect(fallingOver(1)).toBeGreaterThan((fallingOver(4) / 4) * 1.6);
    expect(standing(staged(2500, 1))).toHaveLength(36);
    expect(standing(staged(2500, 4))).toHaveLength(36 * 4);
  });

  it('brings no arrow down at the foot of its target, so the piece is seen among the shafts', () => {
    const shafts = staged(2500).ribbons.filter((ribbon) => ribbon.color === SHAFT && ribbon.alpha > 0.01);
    const groundOf = (top: { x: number; y: number; z: number }, low: { x: number; y: number; z: number }) => {
      const share = top.z / (top.z - low.z);
      return { x: top.x + (low.x - top.x) * share, y: top.y + (low.y - top.y) * share };
    };

    expect(shafts.length).toBeGreaterThan(30);
    for (const shaft of shafts) {
      const ground = groundOf(shaft.points[0], shaft.points[1]);
      expect(Math.hypot(ground.x - TARGET.x, ground.y - TARGET.y)).toBeGreaterThan(CELL * 0.35);
    }
  });

  it('slants the volley in from the side of its caster, the shafts left leaning back the way they came', () => {
    for (const ribbon of standing(staged(2500))) expect(ribbon.points[0].x).toBeLessThan(ribbon.points[2].x);
  });
});
