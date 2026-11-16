import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { sceneLingerMsOf, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { EFFECT_FRAME_BUDGET, type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { gustTimingOf } from '@axe/domain/effect/wind-looks';

const CELL = 50;
const CASTER = { x: 100, y: 300 };
const TARGET = { x: 500, y: 300 };

function gustOf(fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'vortex';
  preset.grade = 1;
  preset.durationMs = 1071;
  preset.staggerMs = 80;
  preset.targeting = 'multi';
  preset.colorPrimary = '#f2fbff';
  preset.colorSecondary = '#8aa6b8';
  Object.assign(preset, fields);
  return preset;
}

function castOn(points: { x: number; y: number }[], caster = true): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: caster ? 'caster' : '',
    origin: caster ? { ...CASTER, z: 30 } : null,
    targets: points.map((point, index) => ({ identifier: `t${index}`, ...point, z: 0 })),
    seed: 11,
  };
}

function staged(preset: EffectPreset, cast: EffectCast, elapsedMs: number): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, cast, elapsedMs, { cellPx: CELL }, drawn);
  return drawn;
}

/** The crescents of the wall: its widest bands with a white middle. */
function crescentsOf(drawn: Staged): EffectRibbon[] {
  return drawn.ribbons.filter((ribbon) => ribbon.core === '#ffffff' && ribbon.points.length === 13);
}

/** How far east the middle of a band is. */
function eastOf(ribbon: EffectRibbon): number {
  return ribbon.points[Math.floor(ribbon.points.length / 2)].x;
}

/** The things the gust has swept up: bands of three points, as a leaf, a twig or a stone is cut. */
function sweptOf(drawn: Staged): EffectRibbon[] {
  return drawn.ribbons.filter((ribbon) => ribbon.points.length === 3);
}

describe('a gust', () => {
  const timing = gustTimingOf(1.071);
  const strikesMs = timing.strikesAt * 1000;

  it('gathers at the feet of its caster before it is thrown, and draws no wall yet', () => {
    const gathering = staged(gustOf(), castOn([TARGET]), 60);

    expect(crescentsOf(gathering)).toEqual([]);
    expect(gathering.motes.length).toBeGreaterThan(0);
    for (const mote of gathering.motes) expect(Math.hypot(mote.x - CASTER.x, mote.y - CASTER.y)).toBeLessThan(CELL * 3);
  });

  it('throws its wall from the caster to the target, there as the blow lands and never before', () => {
    const gust = gustOf();
    const cast = castOn([TARGET]);
    const leading = (ms: number) => Math.max(...crescentsOf(staged(gust, cast, ms)).map(eastOf));
    const halfway = (timing.thrownAt + timing.strikesAt) * 500;

    expect(leading(halfway)).toBeGreaterThan(CASTER.x + CELL);
    expect(leading(halfway)).toBeLessThan(TARGET.x - CELL * 2);
    expect(leading(strikesMs)).toBeCloseTo(TARGET.x, 0);
    expect(leading(strikesMs + 150)).toBeGreaterThan(TARGET.x + CELL * 0.5);
  });

  it('brings its crescents one behind another, each over its own shadow laid before it', () => {
    const drawn = staged(gustOf(), castOn([TARGET]), strikesMs - 20);
    const fronts = crescentsOf(drawn);

    expect(fronts).toHaveLength(3);
    expect(eastOf(fronts[0])).toBeGreaterThan(eastOf(fronts[1]));
    expect(eastOf(fronts[1])).toBeGreaterThan(eastOf(fronts[2]));
    for (const front of fronts) {
      const shadow = drawn.ribbons[drawn.ribbons.indexOf(front) - 1];
      expect(shadow.core).toBeUndefined();
      expect(shadow.points).toHaveLength(13);
      expect((shadow.widths as number[])[6]).toBeGreaterThan((front.widths as number[])[6]);
    }
  });

  it('runs streaks of speed through its wall, many of them, each fading to nothing at its tail', () => {
    const drawn = staged(gustOf(), castOn([TARGET]), strikesMs - 20);
    const streaks = drawn.ribbons.filter((ribbon) => ribbon.points.length === 6 && ribbon.core === '#ffffff');

    expect(streaks.length).toBeGreaterThanOrEqual(18);
    for (const streak of streaks) {
      expect(streak.alphas![0]).toBe(0);
      expect(streak.alphas![5]).toBe(1);
      expect(streak.points[5].x).toBeGreaterThan(streak.points[0].x);
    }
  });

  it('tears dust off the floor behind its front, not ahead of it', () => {
    const drawn = staged(gustOf(), castOn([TARGET]), (timing.thrownAt + timing.strikesAt) * 500);
    const front = Math.max(...crescentsOf(drawn).map(eastOf));
    const dust = drawn.motes.filter((mote) => mote.shape === 'wisp');

    expect(dust.length).toBeGreaterThan(4);
    for (const shred of dust) expect(shred.x - shred.size).toBeLessThan(front + CELL * 1.5);
  });

  it('breaks on the target and is gone as it runs on, leaving curls turning and things whirling downwind', () => {
    const gust = gustOf();
    const cast = castOn([TARGET]);
    const after = staged(gust, cast, strikesMs + 450);

    expect(crescentsOf(after)).toEqual([]);
    expect(after.ribbons.filter((ribbon) => ribbon.points.length === 14).length).toBeGreaterThan(0);
    expect(sweptOf(after).length).toBeGreaterThan(10);
    expect(sweptOf(after).filter((thing) => thing.points[1].x > TARGET.x).length).toBeGreaterThan(8);
  });

  it('lets what it swept up sink to the floor and lie before it is gone, and leaves nothing at the end', () => {
    const gust = gustOf();
    const cast = castOn([TARGET]);
    const highest = (ms: number) => Math.max(...sweptOf(staged(gust, cast, ms)).map((thing) => thing.points[1].z));
    const ends = gust.duration + sceneLingerMsOf(gust);

    expect(highest(strikesMs + 250)).toBeGreaterThan(CELL * 0.5);
    expect(highest(strikesMs + 1150)).toBeLessThan(CELL * 0.35);
    const last = staged(gust, cast, ends - 5);
    expect([last.motes.length, last.ribbons.length, last.floor.length]).toEqual([0, 0, 0]);
  });

  it('blows in from a fixed bearing when it is cast from no one', () => {
    const gust = gustOf();
    const fromNowhere = castOn([TARGET], false);
    const early = crescentsOf(staged(gust, fromNowhere, (timing.thrownAt + timing.strikesAt) * 500));
    const landing = crescentsOf(staged(gust, fromNowhere, strikesMs));

    expect(early.length).toBeGreaterThan(0);
    expect(Math.max(...early.map(eastOf))).toBeLessThan(TARGET.x - CELL);
    expect(Math.max(...landing.map(eastOf))).toBeCloseTo(TARGET.x, 0);
  });

  it('lays every part of itself in the air as colour over a shadow, so it shows on a bright table', () => {
    const gust = gustOf();
    const cast = castOn([TARGET]);
    for (let ms = 0; ms < 1800; ms += 50) {
      const drawn = staged(gust, cast, ms);
      expect(drawn.motes.every((mote) => mote.blend === 'color')).toBe(true);
      expect(drawn.ribbons.every((ribbon) => ribbon.blend === 'color')).toBe(true);
      expect(drawn.lights).toEqual([]);
    }
  });

  it('keeps four gusts thrown together within what the scene draws, near the pieces and over the floor', () => {
    const gust = gustOf();
    const cast = castOn([TARGET, { x: 500, y: 450 }, { x: 600, y: 200 }, { x: 350, y: 500 }]);
    const anchors = [...cast.targets, CASTER];
    for (let ms = 0; ms < 2200; ms += 40) {
      const drawn = staged(gust, cast, ms);
      expect(drawn.motes.length).toBeLessThan(EFFECT_FRAME_BUDGET.motes / 2);
      expect(drawn.ribbons.reduce((sum, ribbon) => sum + ribbon.points.length, 0)).toBeLessThan(
        EFFECT_FRAME_BUDGET.ribbonPoints / 2
      );
      expect(drawn.floor.length).toBeLessThan(EFFECT_FRAME_BUDGET.marks / 4);
      for (const point of [...drawn.motes, ...drawn.ribbons.flatMap((ribbon) => ribbon.points)]) {
        const near = Math.min(...anchors.map((anchor) => Math.hypot(point.x - anchor.x, point.y - anchor.y)));
        expect(near).toBeLessThan(CELL * 10);
        expect(point.z).toBeGreaterThan(-CELL * 0.4);
      }
    }
  });

  it('draws the same frame at the same moment, whatever was drawn before it', () => {
    const gust = gustOf();
    const cast = castOn([TARGET, { x: 500, y: 450 }]);
    const later = JSON.stringify(staged(gust, cast, 700));
    staged(gust, cast, 200);

    expect(JSON.stringify(staged(gust, cast, 700))).toBe(later);
  });

  it('strikes its target with a white flash that lights the floor under it', () => {
    const struck = staged(gustOf(), castOn([TARGET]), strikesMs + 30);
    const lit = struck.floor.filter((mark) => mark.shape === 'disc' && mark.blend === 'light');
    const white = struck.motes.filter((mote) => mote.shape === 'puff' && mote.color === '#ffffff');

    expect(lit.some((mark) => Math.hypot(mark.x - TARGET.x, mark.y - TARGET.y) < CELL * 0.5)).toBe(true);
    expect(white.length).toBeGreaterThan(0);
  });
});
