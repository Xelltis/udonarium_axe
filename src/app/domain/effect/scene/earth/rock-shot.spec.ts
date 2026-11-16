import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { SHED_PEBBLES, SHOT_ROCK_CELLS } from '@axe/domain/effect/scene/earth/rock-shot';
import { sceneLingerMsOf, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { type EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { projectileTiming } from '@axe/domain/effect/timeline/flight-timing';

const CELL = 50;
const CASTER = { x: 50, y: 300 };
const TARGET = { x: 400, y: 300 };

function shotOf(fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'projectile';
  preset.impactKind = 'rubble';
  preset.tagName = '射撃';
  preset.grade = 2;
  preset.durationMs = 850;
  preset.colorPrimary = '#e0c39a';
  preset.colorSecondary = '#6b4f33';
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

function rocksOf(drawn: Staged): EffectMote[] {
  return drawn.motes.filter((mote) => mote.shape === 'chunk');
}

describe('a shot of rock', () => {
  it('is in the air longer than the bolt of light it is written as', () => {
    expect(landsMs(shotOf())).toBeCloseTo(460, 5);
    expect(landsMs(shotOf({ impactKind: 'burst' }))).toBeCloseTo(340, 5);
  });

  it('flies as a boulder of colour with its shadow under it, and no tail of light', () => {
    const shot = shotOf();
    const flying = staged(shot, landsMs(shot) * 0.5);
    const boulder = rocksOf(flying).reduce((widest, rock) => (rock.size > widest.size ? rock : widest));

    expect(boulder.size).toBeGreaterThanOrEqual(SHOT_ROCK_CELLS * CELL);
    expect(boulder.x).toBeGreaterThan(CASTER.x + CELL);
    expect(boulder.x).toBeLessThan(TARGET.x - CELL);
    expect(flying.ribbons).toEqual([]);
    expect(flying.motes.filter((mote) => mote.blend === 'light')).toEqual([]);
    const shadow = flying.floor.find((mark) => mark.shape === 'disc' && mark.blend === 'color')!;
    expect(Math.abs(shadow.x - boulder.x)).toBeLessThan(1);
    expect(shadow.z).toBe(0);
  });

  it('tumbles as it flies, on an arc over the straight way to its target', () => {
    const shot = shotOf();
    const at = (share: number) =>
      rocksOf(staged(shot, landsMs(shot) * share)).reduce((widest, rock) => (rock.size > widest.size ? rock : widest));

    expect(at(0.3).spin).not.toBeCloseTo(at(0.5).spin!, 1);
    expect(at(0.5).z).toBeGreaterThan((at(0.05).z + at(0.95).z) / 2 + CELL * 0.2);
  });

  it('sheds dust behind it and pebbles that fall away along its way', () => {
    const shot = shotOf();
    const flying = staged(shot, landsMs(shot) * 0.7);
    const boulderX = Math.max(...rocksOf(flying).map((rock) => rock.x));
    const dust = flying.motes.filter((mote) => mote.shape === 'smoke');
    const pebbles = rocksOf(flying).filter((rock) => rock.size < CELL * 0.15);

    expect(dust.length).toBeGreaterThan(5);
    for (const puff of dust) expect(puff.x).toBeLessThan(boulderX);
    expect(pebbles.length).toBeGreaterThan(1);
    expect(pebbles.length).toBeLessThanOrEqual(SHED_PEBBLES);
  });

  it('breaks where it lands: its pieces thrown on the way it flew, gravel sprayed, a dent left', () => {
    const shot = shotOf();
    const broken = staged(shot, landsMs(shot) + 350);
    const pieces = rocksOf(broken);
    const onward = pieces.filter((rock) => rock.x > TARGET.x).length;

    expect(pieces.length).toBeGreaterThan(25);
    expect(onward).toBeGreaterThan(pieces.length * 0.6);
    expect(Math.max(...pieces.map((rock) => rock.size))).toBeLessThan(SHOT_ROCK_CELLS * CELL);
    expect(broken.floor.filter((mark) => mark.shape === 'scorch').length).toBeGreaterThan(0);
    expect(broken.motes.filter((mote) => mote.shape === 'crag')).toEqual([]);
  });

  it('leaves its pieces lying until the shot has cleared', () => {
    const shot = shotOf();
    const ends = shot.duration + sceneLingerMsOf(shot);
    const lying = rocksOf(staged(shot, ends - 700));

    expect(lying.length).toBeGreaterThan(25);
    for (const rock of lying) expect(rock.z).toBeLessThan(CELL * 0.4);
    expect(Math.max(...rocksOf(staged(shot, ends - 20)).map((rock) => rock.alpha))).toBeLessThan(0.1);
  });

  it('leaves a bolt that lands in rubble but is of another element a bolt of magic', () => {
    const fiery = shotOf({ tagName: '炎' });
    const flying = staged(fiery, 170);

    expect(flying.motes.some((mote) => mote.shape === 'lick')).toBe(true);
    expect(rocksOf(flying)).toEqual([]);
  });

  it('flies over a dark rim and breaks with a white flash that lights the floor', () => {
    const shot = shotOf();
    const flying = staged(shot, landsMs(shot) * 0.5);
    const boulder = rocksOf(flying).reduce((widest, rock) => (rock.size > widest.size ? rock : widest));
    const broken = staged(shot, landsMs(shot) + 60);
    const lit = broken.floor.filter((mark) => mark.shape === 'disc' && mark.blend === 'light');

    expect(boulder.color).toBe('#1d140d');
    expect(lit.some((mark) => Math.hypot(mark.x - TARGET.x, mark.y - TARGET.y) < CELL * 0.5)).toBe(true);
  });
});
