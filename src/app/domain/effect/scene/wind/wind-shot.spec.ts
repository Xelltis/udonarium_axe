import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { sceneLingerMsOf, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { projectileTiming } from '@axe/domain/effect/timeline/flight-timing';

const CELL = 50;
const CASTER = { x: 100, y: 300 };
const TARGET = { x: 500, y: 300 };

function shotOf(fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'projectile';
  preset.impactKind = 'vortex';
  preset.tagName = '射撃';
  preset.grade = 2;
  preset.durationMs = 780;
  preset.colorPrimary = '#f2fbff';
  preset.colorSecondary = '#8aa6b8';
  Object.assign(preset, fields);
  return preset;
}

const CAST: EffectCast = {
  presetIdentifier: 'preset',
  casterIdentifier: 'caster',
  origin: { ...CASTER, z: 30 },
  targets: [{ identifier: 't0', ...TARGET, z: 0 }],
  seed: 11,
};

function staged(preset: EffectPreset, elapsedMs: number): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, CAST, elapsedMs, { cellPx: CELL }, drawn);
  return drawn;
}

function landsMs(preset: EffectPreset): number {
  return projectileTiming(preset).shots[0].land * preset.duration;
}

/** The ring of wind of a burst: its one band drawn all the way round with a white middle. */
function ringOf(drawn: Staged): EffectRibbon | undefined {
  return drawn.ribbons.find((ribbon) => ribbon.points.length === 29 && ribbon.core === '#ffffff');
}

function highestOf(drawn: Staged): number {
  return Math.max(
    0,
    ...drawn.motes.map((mote) => mote.z),
    ...drawn.ribbons.flatMap((ribbon) => ribbon.points).map((point) => point.z)
  );
}

describe('a shot of wind', () => {
  it('flies as a knot of air: a pale heart over its shadow with coils wound round it by halves', () => {
    const shot = shotOf();
    const flying = staged(shot, landsMs(shot) * 0.5);
    const far = flying.ribbons.filter((ribbon) => ribbon.half === 'far');
    const near = flying.ribbons.filter((ribbon) => ribbon.half === 'near');
    const hearts = flying.motes.filter((mote) => mote.shape === 'glow');

    expect(far).toHaveLength(4);
    expect(near).toHaveLength(4);
    expect(flying.ribbons.indexOf(far[3])).toBeLessThan(flying.ribbons.indexOf(near[0]));
    expect(hearts.map((heart) => heart.color).at(-1)).toBe('#ffffff');
    expect(hearts[0].size).toBeGreaterThan(hearts.at(-1)!.size);
    expect(hearts[0].x).toBeGreaterThan(CASTER.x + CELL);
    expect(hearts[0].x).toBeLessThan(TARGET.x - CELL);
    expect(flying.motes.every((mote) => mote.blend === 'color')).toBe(true);
    expect(flying.ribbons.every((ribbon) => ribbon.blend === 'color')).toBe(true);
  });

  it('turns its coils as it flies', () => {
    const shot = shotOf();
    const coilAt = (ms: number) => staged(shot, ms).ribbons.find((ribbon) => ribbon.half === 'near')!;
    const now = coilAt(landsMs(shot) * 0.5);
    const head = now.points.at(-1)!;
    const about = now.about!.at(-1)!;

    expect(Math.hypot(head.x - about.x, head.y - about.y, head.z - about.z)).toBeGreaterThan(CELL * 0.1);
    expect(Math.hypot(head.x - about.x, head.y - about.y, head.z - about.z)).toBeLessThan(CELL * 0.6);
  });

  it('bursts where it lands in a ring of wind that races out level, and stands up no whirlwind', () => {
    const shot = shotOf();
    const lands = landsMs(shot);
    const radiusAt = (ms: number) => {
      const ring = ringOf(staged(shot, lands + ms))!;
      return Math.hypot(ring.points[0].x - TARGET.x, ring.points[0].y - TARGET.y);
    };

    expect(radiusAt(120)).toBeGreaterThan(radiusAt(40) + CELL * 0.4);
    expect(radiusAt(300)).toBeGreaterThan(CELL * 1.8);
    expect(ringOf(staged(shot, lands + 500))).toBeUndefined();
    for (let ms = 0; ms < 1500; ms += 50) expect(highestOf(staged(shot, lands + ms))).toBeLessThan(CELL * 2.6);
  });

  it('throws streaks out round the burst, and dust out over the floor under it', () => {
    const shot = shotOf();
    const burst = staged(shot, landsMs(shot) + 150);
    const streaks = burst.ribbons.filter((ribbon) => ribbon.points.length === 6);
    const dust = burst.motes.filter((mote) => mote.shape === 'smoke');

    expect(streaks.length).toBeGreaterThanOrEqual(12);
    for (const streak of streaks) {
      const out = (point: { x: number; y: number }) => Math.hypot(point.x - TARGET.x, point.y - TARGET.y);
      expect(out(streak.points[5])).toBeGreaterThan(out(streak.points[0]));
    }
    expect(dust.length).toBeGreaterThanOrEqual(10);
    for (const cloud of dust) expect(cloud.z).toBeLessThan(CELL);
  });

  it('is gone before its lingering ends', () => {
    const shot = shotOf();
    const last = staged(shot, shot.duration + sceneLingerMsOf(shot) - 5);

    expect([last.motes.length, last.ribbons.length, last.floor.length]).toEqual([0, 0, 0]);
  });

  it('leaves a bolt of another element as it was: a bolt of light that lands in the whirlwind', () => {
    const fire = shotOf({ tagName: '炎' });
    const lands = landsMs(fire);
    const flying = staged(fire, lands * 0.5);

    expect(flying.ribbons.some((ribbon) => ribbon.blend === 'light')).toBe(true);
    expect(flying.ribbons.some((ribbon) => ribbon.half !== undefined)).toBe(false);
    expect(ringOf(staged(fire, lands + 120))).toBeUndefined();
    expect(highestOf(staged(fire, lands + 500))).toBeGreaterThan(CELL * 3);
  });

  it('leaves a bolt that lands in anything else as it was', () => {
    const plain = shotOf({ impactKind: 'burst' });
    const flying = staged(plain, landsMs(plain) * 0.5);

    expect(flying.ribbons.some((ribbon) => ribbon.blend === 'light')).toBe(true);
    expect(flying.ribbons.some((ribbon) => ribbon.half !== undefined)).toBe(false);
  });

  it('bursts with a white flash that lights the floor under the target', () => {
    const shot = shotOf();
    const burst = staged(shot, landsMs(shot) + 30);
    const lit = burst.floor.filter((mark) => mark.shape === 'disc' && mark.blend === 'light');

    expect(lit.some((mark) => Math.hypot(mark.x - TARGET.x, mark.y - TARGET.y) < CELL * 0.5)).toBe(true);
    expect(burst.motes.some((mote) => mote.shape === 'puff' && mote.color === '#ffffff')).toBe(true);
  });
});
