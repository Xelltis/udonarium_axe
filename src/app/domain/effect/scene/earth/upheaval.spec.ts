import { upheavalTimingOf } from '@axe/domain/effect/earth-looks';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { PILLAR, RUN_FANGS } from '@axe/domain/effect/scene/earth/fang-layout';
import { sceneLingerMsOf, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { type EffectMote } from '@axe/domain/effect/scene/effect-scene';

const CELL = 50;
const CASTER = { x: 50, y: 300 };
const TARGET = { x: 400, y: 300 };
const DURATION_MS = 5042;
const TIMING = upheavalTimingOf(DURATION_MS / 1000, 0.605);

function upheavalOf(fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'upheaval';
  preset.grade = 3;
  preset.durationMs = DURATION_MS;
  preset.staggerMs = 110;
  preset.targeting = 'multi';
  preset.maxTargets = 8;
  preset.colorPrimary = '#e0c39a';
  preset.colorSecondary = '#6b4f33';
  Object.assign(preset, fields);
  return preset;
}

/** A cast on some points; each lay-out of one is given a seed of its own, as every cast has. */
function castOn(points: { x: number; y: number }[], caster = true, seed = 11): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: caster ? 'caster' : '',
    origin: caster ? { ...CASTER, z: 30 } : null,
    targets: points.map((point, index) => ({ identifier: `t${index}`, ...point, z: 0 })),
    seed,
  };
}

function staged(preset: EffectPreset, cast: EffectCast, seconds: number): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, cast, seconds * 1000, { cellPx: CELL }, drawn);
  return drawn;
}

/** A fang as it is drawn: where its root is, how tall it stands, how much of it is broken off and how far light has climbed it. */
interface Stood {
  readonly x: number;
  readonly y: number;
  readonly tall: number;
  readonly broken: number;
  readonly veins: number;
  readonly mote: EffectMote;
}

function fangsOf(drawn: Staged): Stood[] {
  return drawn.motes
    .filter((mote) => mote.shape === 'crag')
    .map((mote) => {
      const speed = Math.hypot(mote.velocity!.x, mote.velocity!.y, mote.velocity!.z);
      const reach = speed * (mote.trail ?? 0) + mote.size;
      const spin = mote.spin ?? 0;
      return {
        x: mote.x - (mote.velocity!.x / speed) * reach,
        y: mote.y - (mote.velocity!.y / speed) * reach,
        tall: reach,
        broken: Math.floor(spin) / 100,
        veins: spin - Math.floor(spin),
        mote,
      };
    });
}

function farFrom(point: { x: number; y: number }, fang: Stood): number {
  return Math.hypot(fang.x - point.x, fang.y - point.y);
}

describe('an upheaval', () => {
  const single = castOn([TARGET]);

  it('gathers at its caster before anything breaks the ground', () => {
    const gathering = staged(upheavalOf(), single, TIMING.runsAt - 0.05);

    expect(fangsOf(gathering)).toEqual([]);
    expect(gathering.floor.length).toBeGreaterThan(0);
    for (const mark of gathering.floor) expect(Math.hypot(mark.x - CASTER.x, mark.y - CASTER.y)).toBeLessThan(CELL * 2);
  });

  it('runs fangs from its caster to its target one after another, each taller than the last', () => {
    const preset = upheavalOf();
    const early = fangsOf(staged(preset, single, TIMING.runsAt + 0.08));
    const late = fangsOf(staged(preset, single, TIMING.burstsAt - 0.01));

    expect(early.length).toBeGreaterThan(0);
    expect(late.length).toBeGreaterThan(early.length);
    expect(late.length).toBeGreaterThanOrEqual(RUN_FANGS.fewest);
    expect(Math.max(...early.map((fang) => fang.x))).toBeLessThan(Math.max(...late.map((fang) => fang.x)));
    for (const fang of late) expect(fang.x).toBeLessThan(TARGET.x - CELL * 0.5);
    const ran = late.map((fang) => Math.round(fang.x));
    const settled = fangsOf(staged(preset, single, TIMING.burstsAt + 0.5))
      .filter((fang) => ran.includes(Math.round(fang.x)))
      .sort((a, b) => a.x - b.x);
    expect(settled).toHaveLength(late.length);
    for (let index = 1; index < settled.length; index++) {
      expect(settled[index].tall).toBeGreaterThan(settled[index - 1].tall);
    }
  });

  it('bursts its greatest pillar up under the target as the blow lands, in a white beat with a light', () => {
    const preset = upheavalOf();
    const beat = staged(preset, single, TIMING.burstsAt + 0.03);
    const stood = fangsOf(staged(preset, single, TIMING.burstsAt + 0.4));
    const pillar = stood.reduce((tallest, fang) => (fang.tall > tallest.tall ? fang : tallest));

    expect(beat.floor.some((mark) => mark.color === '#ffffff' && mark.blend === 'light')).toBe(true);
    expect(beat.lights.length).toBeGreaterThan(0);
    expect(pillar.tall).toBeCloseTo(PILLAR.tall * CELL, 0);
    expect(farFrom(TARGET, pillar)).toBeLessThan(CELL * 0.5);
    expect(pillar.x).toBeGreaterThan(TARGET.x);
  });

  it('draws every fang as rock with faces, held to its own depth so a piece before it hides it', () => {
    const stood = fangsOf(staged(upheavalOf(), single, TIMING.burstsAt + 0.5));

    expect(stood.length).toBeGreaterThan(12);
    for (const fang of stood) {
      expect(fang.mote.blend).toBe('color');
      expect(fang.mote.exactDepth).toBe(true);
    }
  });

  it('grows by the root of the size of its target, so a pillar under a giant does not wall the table off', () => {
    const drawn = nothingStaged();
    stageEffect(
      upheavalOf(),
      castOn([TARGET], true, 15),
      (TIMING.burstsAt + 0.4) * 1000,
      { cellPx: CELL, resolveSize: () => 4 },
      drawn
    );

    expect(Math.max(...fangsOf(drawn).map((fang) => fang.tall))).toBeCloseTo(PILLAR.tall * CELL * 2, 0);
  });

  it('only spreads from the target where no one cast it', () => {
    const preset = upheavalOf();
    const nowhere = castOn([TARGET], false, 12);

    expect(fangsOf(staged(preset, nowhere, TIMING.burstsAt - 0.02))).toEqual([]);
    const stood = fangsOf(staged(preset, nowhere, TIMING.burstsAt + 0.5));
    expect(stood.length).toBeGreaterThan(5);
    for (const fang of stood) expect(farFrom(TARGET, fang)).toBeLessThan(CELL * 2.2);
  });

  it('spreads a ring of fangs out to the reach of its area, the nearer the sooner', () => {
    const preset = upheavalOf({ areaRadius: 3 });
    const wide = castOn([TARGET], true, 13);
    const ringAt = (seconds: number) =>
      fangsOf(staged(preset, wide, seconds)).filter(
        (fang) => farFrom(TARGET, fang) > CELL && fang.x > TARGET.x - CELL * 0.5
      );
    const first = ringAt(TIMING.burstsAt + 0.1);
    const all = ringAt(TIMING.burstsAt + 0.6);

    expect(first.length).toBeGreaterThan(0);
    expect(all.length).toBeGreaterThan(first.length);
    expect(Math.max(...first.map((fang) => farFrom(TARGET, fang)))).toBeLessThan(
      Math.max(...all.map((fang) => farFrom(TARGET, fang)))
    );
    expect(Math.max(...all.map((fang) => farFrom(TARGET, fang)))).toBeLessThanOrEqual(3 * CELL + 1);
    expect(Math.max(...all.map((fang) => farFrom(TARGET, fang)))).toBeGreaterThan(2.2 * CELL);
  });

  it('breaks a fang under each other target it catches as the ring reaches it, and keeps the ring clear of them', () => {
    const preset = upheavalOf({ areaRadius: 3 });
    const other = { x: TARGET.x + 120, y: TARGET.y + 40 };
    const cast = castOn([TARGET, other], true, 14);
    const near = (seconds: number) =>
      fangsOf(staged(preset, cast, seconds)).filter((fang) => farFrom(other, fang) < CELL * 0.75);

    expect(near(TIMING.burstsAt + 0.02)).toEqual([]);
    const under = near(TIMING.burstsAt + 0.6);
    expect(under.length).toBe(2);
    expect(Math.max(...under.map((fang) => fang.tall))).toBeGreaterThan(CELL * 1.4);
    expect(Math.max(...under.map((fang) => fang.tall))).toBeLessThan(PILLAR.tall * CELL);
  });

  it('climbs its cracks with light, breaks from the top down and sinks, each piece falling from where it stood', () => {
    const preset = upheavalOf();
    const standing = fangsOf(staged(preset, single, TIMING.cracksAt - 0.3));
    const cracking = fangsOf(staged(preset, single, TIMING.breaksAt - 0.02));
    const breaking = staged(preset, single, TIMING.breaksAt + 0.3);

    expect(Math.max(...standing.map((fang) => fang.veins))).toBeLessThan(0.2);
    expect(Math.max(...standing.map((fang) => fang.broken))).toBe(0);
    expect(Math.max(...cracking.map((fang) => fang.veins))).toBeGreaterThan(0.8);
    expect(Math.max(...fangsOf(breaking).map((fang) => fang.broken))).toBeGreaterThan(0.5);
    const falling = breaking.motes.filter((mote) => mote.shape === 'chunk' && mote.z > CELL);
    expect(falling.length).toBeGreaterThan(4);
    expect(fangsOf(staged(preset, single, TIMING.sunkAt + 0.3))).toEqual([]);
  });

  it('leaves broken ground and rubble for more than a second after the last fang has sunk', () => {
    const preset = upheavalOf();
    const ends = (preset.duration + sceneLingerMsOf(preset)) / 1000;
    const left = staged(preset, single, ends - 0.7);

    expect(ends - TIMING.sunkAt).toBeGreaterThan(1.5);
    expect(left.motes.filter((mote) => mote.shape === 'chunk' && mote.alpha === 1).length).toBeGreaterThan(40);
    expect(left.floor.filter((mark) => mark.shape === 'scorch').length).toBeGreaterThan(10);
    expect(staged(preset, single, ends + 0.01).motes).toEqual([]);
  });

  it('bursts without the run about the target where a blade lands in it, and has cleared by the time the blade has', () => {
    const blade = upheavalOf({ kind: 'skyblade', impactKind: 'upheaval', durationMs: 3000 });
    const strikes = effectBlowsOf(blade)[0].atMs / 1000;
    const stood = fangsOf(staged(blade, single, strikes + 0.5)).filter((fang) => farFrom(TARGET, fang) < CELL * 4);

    expect(fangsOf(staged(blade, single, strikes - 0.05))).toEqual([]);
    expect(stood.length).toBeGreaterThan(5);
    const ends = (blade.duration + sceneLingerMsOf(blade)) / 1000;
    const last = staged(blade, single, ends - 0.03);
    expect(Math.max(0, ...last.motes.filter((mote) => mote.shape === 'chunk').map((mote) => mote.alpha))).toBeLessThan(
      0.1
    );
  });
});
