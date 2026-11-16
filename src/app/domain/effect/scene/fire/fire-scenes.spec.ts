import { hexChannels } from '@axe/core/util/hex-color';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { sceneLingerMsOf, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { flameRampOf } from '@axe/domain/effect/scene/effect-ramp';
import { type EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { smokeColorOf } from '@axe/domain/effect/scene/fire/fire-body';

const CELL = 50;
const AT: [number, number] = [400, 300];

function presetOf(kind: EffectKind, fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = 2;
  preset.durationMs = 1200;
  preset.colorPrimary = '#ffd166';
  preset.colorSecondary = '#ff4d2e';
  Object.assign(preset, fields);
  return preset;
}

function castOn(...points: [number, number][]): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: '',
    origin: null,
    targets: points.map(([x, y], index) => ({ identifier: `t${index}`, x, y, z: 0 })),
    seed: 11,
  };
}

function staged(preset: EffectPreset, elapsedMs: number, cast = castOn(AT)): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, cast, elapsedMs, { cellPx: CELL }, drawn);
  return drawn;
}

/** Every frame of an effect, every 40 milliseconds from its start until it has cleared. */
function everyFrame(preset: EffectPreset, cast = castOn(AT)): Staged[] {
  const frames: Staged[] = [];
  const ends = preset.totalDuration(cast.targets.length) + sceneLingerMsOf(preset);
  for (let ms = 0; ms <= ends; ms += 40) frames.push(staged(preset, ms, cast));
  return frames;
}

const isBall = (mote: EffectMote) => mote.shape === 'puff' && mote.blend === 'color';
const isFire = (mote: EffectMote) => mote.shape === 'blaze' || mote.shape === 'lick';
/** How far from where it is cast the fire of a frame reaches, over the floor, in table pixels. */
const reachOf = (drawn: Staged) =>
  Math.max(
    0,
    ...drawn.motes
      .filter((mote) => mote.shape === 'blaze')
      .map((mote) => Math.hypot(mote.x - AT[0], mote.y - AT[1]) + mote.size / 2)
  );
/** How far the longest tongue of a frame reaches from its root, in table pixels. */
const tallestOf = (drawn: Staged) =>
  Math.max(
    0,
    ...drawn.motes.filter((mote) => mote.shape === 'lick').map((mote) => (mote.trail ?? 0) * 100 + mote.size)
  );

describe('the looks of fire', () => {
  const KINDS: readonly EffectKind[] = ['burst', 'flame', 'nova', 'mushroom'];

  it.each(KINDS)('draws the fire of %s as flames that flow, with no ball of colour among them', (kind) => {
    for (const grade of [1, 2, 3]) {
      const frames = everyFrame(presetOf(kind, { grade, durationMs: 2000 }), castOn(AT, [520, 300]));

      expect(frames.some((drawn) => drawn.motes.some(isFire))).toBe(true);
      expect(frames.some((drawn) => drawn.motes.some(isBall))).toBe(false);
      expect(frames.some((drawn) => drawn.motes.some((mote) => mote.shape === 'tongue'))).toBe(false);
    }
  });

  it.each(KINDS)('cools the fire of %s to smoke that is still there once the fire is out, and clears', (kind) => {
    const preset = presetOf(kind, { grade: 2, durationMs: 2000 });
    const frames = everyFrame(preset);
    const lastWith = (has: (mote: EffectMote) => boolean) =>
      frames.reduce((last, drawn, index) => (drawn.motes.some(has) ? index : last), -1);
    const lastFire = lastWith(isFire);
    const lastSmoke = lastWith((mote) => mote.shape === 'billow');

    expect(lastSmoke).toBeGreaterThan(lastFire);
    expect(frames.at(-1)?.motes.filter((mote) => mote.shape === 'billow' && mote.alpha > 0.25)).toHaveLength(0);
  });

  it('strikes a blast in a beat of light and rays, with no white ball laid over the table', () => {
    for (const kind of ['burst', 'nova', 'mushroom'] as const) {
      const preset = presetOf(kind, { grade: 3, durationMs: 2000 });
      const beat = staged(preset, effectBlowsOf(preset)[0].atMs + 20);

      expect(beat.motes.filter((mote) => mote.shape === 'flare').length).toBeGreaterThanOrEqual(12);
      expect(beat.motes.some((mote) => mote.shape === 'puff')).toBe(false);
    }
  });
});

describe('the grades of a burst', () => {
  const at = (grade: number, sinceMs: number) => {
    const preset = presetOf('burst', { grade });
    return staged(preset, effectBlowsOf(preset)[0].atMs + sinceMs);
  };

  it('swells a greater fireball at each grade, and burns it longer', () => {
    expect(reachOf(at(2, 200))).toBeGreaterThan(reachOf(at(1, 200)) * 1.25);
    expect(reachOf(at(3, 200))).toBeGreaterThan(reachOf(at(2, 200)) * 1.2);
    expect(at(1, 500).motes.some((mote) => mote.shape === 'blaze')).toBe(false);
    expect(at(3, 500).motes.some((mote) => mote.shape === 'blaze')).toBe(true);
  });

  it('pops at the lowest grade, throws a shock ring at the middle one and rocks and brands at the highest', () => {
    const rings = (grade: number) =>
      at(grade, 100).floor.filter((mark) => mark.shape === 'ring' && mark.blend === 'light').length;
    const chunks = (grade: number) => at(grade, 300).motes.filter((mote) => mote.shape === 'chunk').length;

    expect(rings(1)).toBe(0);
    expect(rings(2)).toBe(1);
    expect(rings(3)).toBeGreaterThan(2);
    expect(chunks(2)).toBeGreaterThan(chunks(1));
    expect(chunks(3)).toBeGreaterThan(chunks(2));
  });

  it('leaves soot where it is of the colour of flame, and a haze of its own colour where it is not', () => {
    const cold = presetOf('burst', { colorPrimary: '#dff6ff', colorSecondary: '#39a7ff' });
    const hot = presetOf('burst');
    const smokeOf = (preset: EffectPreset) =>
      staged(preset, effectBlowsOf(preset)[0].atMs + 900).motes.filter(
        (mote) => mote.shape === 'billow' && mote.z > CELL
      );

    const [soot] = hexChannels(smokeColorOf(flameRampOf('#ffd166', '#ff4d2e'), true))!;
    const blueOf = (mote: EffectMote) => hexChannels(mote.color)![2];
    const redOf = (mote: EffectMote) => hexChannels(mote.color)![0];

    expect(smokeOf(hot).length).toBeGreaterThan(0);
    expect(smokeOf(hot).every((mote) => redOf(mote) < soot + 40 && blueOf(mote) < 110)).toBe(true);
    expect(smokeOf(cold).length).toBeGreaterThan(0);
    expect(smokeOf(cold).every((mote) => blueOf(mote) > 200 && blueOf(mote) > redOf(mote))).toBe(true);
    expect(Math.max(...smokeOf(cold).map((mote) => mote.alpha))).toBeLessThan(
      Math.max(...smokeOf(hot).map((mote) => mote.alpha))
    );
  });
});

describe('the grades of a piece set ablaze', () => {
  const burning = (grade: number, atMs = 1500) => staged(presetOf('flame', { grade, durationMs: 3000 }), atMs);

  it('burns higher at each grade: a flame at the feet, a fire to the head, a fire far past it', () => {
    const tallest = (grade: number) =>
      Math.max(...[1300, 1400, 1500, 1600, 1700].map((atMs) => tallestOf(burning(grade, atMs))));

    expect(tallest(1)).toBeLessThan(CELL * 1.1);
    expect(tallest(2)).toBeGreaterThan(tallest(1) * 1.15);
    expect(tallest(3)).toBeGreaterThan(tallest(2) * 1.4);
    expect(burning(3).motes.filter(isFire).length).toBeGreaterThan(burning(1).motes.filter(isFire).length * 1.5);
  });

  it('catches the least fire in a flash and a ring of light, leaping up past its height before it settles low', () => {
    const least = presetOf('flame', { grade: 1, durationMs: 1071 });
    const caught = staged(least, 200);
    const tallestAt = (atMs: number) => tallestOf(staged(least, atMs));

    expect(caught.motes.some((mote) => mote.shape === 'puff' && mote.size > CELL * 0.5)).toBe(true);
    expect(caught.floor.some((mark) => mark.shape === 'ring')).toBe(true);
    expect(tallestAt(300)).toBeGreaterThan(tallestAt(800) * 1.5);
    expect(tallestAt(300)).toBeGreaterThan(CELL * 1.3);
  });

  it('stands its fire on every side of the piece, held to its own depth so the piece hides what is beyond it', () => {
    const flames = burning(2).motes.filter(isFire);

    expect(flames.every((mote) => mote.exactDepth === true)).toBe(true);
    expect(flames.some((mote) => mote.x < AT[0] - CELL * 0.1)).toBe(true);
    expect(flames.some((mote) => mote.x > AT[0] + CELL * 0.1)).toBe(true);
    expect(flames.some((mote) => mote.y < AT[1] - CELL * 0.1)).toBe(true);
    expect(flames.some((mote) => mote.y > AT[1] + CELL * 0.1)).toBe(true);
  });

  it('leaps as it catches, and reddens and sinks as it dies', () => {
    const hearts = (drawn: Staged) => drawn.motes.filter((mote) => mote.shape === 'lick' && mote.core !== undefined);

    expect(tallestOf(burning(2, 250))).toBeGreaterThan(tallestOf(burning(2, 1500)) * 1.15);
    expect(tallestOf(burning(2, 2900))).toBeLessThan(tallestOf(burning(2, 1500)) * 0.6);
    expect(hearts(burning(2, 2850)).length).toBeLessThan(hearts(burning(2, 1500)).length);
  });
});

describe('a great blast over an area', () => {
  it('throws a front of flame across the floor and leaves fires burning behind it', () => {
    for (const kind of ['nova', 'mushroom'] as const) {
      const preset = presetOf(kind, { grade: 3, durationMs: 3000, targeting: 'multi', maxTargets: 4, areaRadius: 3 });
      const goesOff = effectBlowsOf(preset)[0].atMs;
      const farthest = (sinceMs: number) =>
        Math.max(
          0,
          ...staged(preset, goesOff + sinceMs)
            .motes.filter((mote) => mote.shape === 'lick' && mote.exactDepth)
            .map((mote) => Math.hypot(mote.x - AT[0], mote.y - AT[1]))
        );

      expect(farthest(40)).toBeGreaterThan(0);
      expect(farthest(450)).toBeGreaterThan(farthest(40) * 1.8);
      expect(farthest(450)).toBeGreaterThan(CELL * 2.5);
      expect(farthest(1100)).toBeGreaterThan(CELL * 1.5);
    }
  });

  it('raises the cap of the greatest blast high over a stem of fire', () => {
    const preset = presetOf('mushroom', { grade: 3, durationMs: 4000 });
    const drawn = staged(preset, effectBlowsOf(preset)[0].atMs + 1100);
    const cap = drawn.motes.filter((mote) => mote.shape === 'blaze' && mote.z > CELL * 2.4);
    const stem = drawn.motes.filter((mote) => mote.shape === 'lick' && mote.z > CELL * 2 && !mote.exactDepth);

    expect(cap.length).toBeGreaterThanOrEqual(6);
    expect(stem.length).toBeGreaterThan(0);
  });
});
