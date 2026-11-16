import { effectBlowsOf, heldEffectClock } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { cutPictureSprites } from '@axe/domain/effect/effect-timeline';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { motionPoseAt, type PieceMotionKind } from '@axe/domain/tabletop/world/piece-motions';

const CELL = 50;
const CASTER = { x: 100, y: 300 };
const TARGET = { x: 400, y: 300 };
const PICTURED = { baseSize: CELL, resolveImage: () => 'blob:token' };

function defeatOf(kind: 'gore' | 'bisect' | 'dissolve'): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.grade = kind === 'gore' ? 2 : 3;
  preset.durationMs = { gore: 1332, bisect: 2000, dissolve: 4493 }[kind];
  preset.colorPrimary = kind === 'gore' ? '#c1121f' : '#f2f6ff';
  preset.colorSecondary = kind === 'gore' ? '#5c0a11' : '#7a0d15';
  return preset;
}

function castOf(): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: 'caster',
    origin: { ...CASTER, z: 30 },
    targets: [{ identifier: 't0', ...TARGET, z: 0 }],
    seed: 3,
  };
}

function staged(preset: EffectPreset, elapsedMs: number): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, castOf(), elapsedMs, { cellPx: CELL }, drawn);
  return drawn;
}

/** The first moment on the wall clock, in steps of 10 milliseconds, that something is so. */
function firstWhen(holds: (wallMs: number) => boolean): number {
  for (let ms = 0; ms < 3000; ms += 10) if (holds(ms)) return ms;
  return Infinity;
}

/** The first moment the piece itself has gone from the table as it falls. */
function pieceGoneAt(fall: PieceMotionKind): number {
  return firstWhen((ms) => (motionPoseAt(fall, ms)?.shown ?? 1) <= 0.001);
}

describe('blood bursting from a wound', () => {
  it('bursts a splash of red out of the wound as the blow lands, longest away from the one who struck', () => {
    const gore = defeatOf('gore');
    const splash = staged(gore, effectBlowsOf(gore)[0].atMs).motes.filter((mote) => mote.shape === 'tongue');
    const reach = (far: boolean) =>
      Math.max(...splash.filter((mote) => mote.x > TARGET.x === far).map((mote) => Math.abs(mote.x - TARGET.x)));

    expect(splash.length).toBeGreaterThan(8);
    expect(reach(true)).toBeGreaterThan(reach(false) * 1.2);
  });

  it('flings most of its drops away from the one who struck', () => {
    const drops = staged(defeatOf('gore'), 300).motes.filter((mote) => mote.shape === 'comet' || mote.shape === 'puff');

    expect(drops.filter((mote) => mote.x > TARGET.x).length).toBeGreaterThan(
      drops.filter((mote) => mote.x < TARGET.x).length * 2
    );
  });
});

describe('a cut that cleaves a piece in two', () => {
  it('lays the whole line of the cut through the piece as one hard band in the frame its blow lands in, a gleam before it', () => {
    const cut = defeatOf('bisect');
    const lands = effectBlowsOf(cut)[0].atMs;
    const bandAt = (ms: number) =>
      staged(cut, ms).motes.filter((mote) => mote.shape === 'puff' && mote.aside !== undefined);
    const reachOf = (ms: number) =>
      Math.max(0, ...bandAt(ms).map((mote) => Math.hypot(mote.aside!.right, mote.aside!.up)));

    expect(bandAt(lands).length).toBeGreaterThan(100);
    expect(reachOf(lands)).toBeGreaterThan(CELL * 1.5);
    expect(Math.max(...bandAt(lands).map((mote) => mote.size))).toBeGreaterThan(CELL * 0.25);
    expect(bandAt(lands - 40)).toEqual([]);
  });

  it('parts the halves of the picture just as the piece itself has faded from the table, and not long after', () => {
    const cut = defeatOf('bisect');
    const blows = effectBlowsOf(cut);
    const parted = firstWhen((ms) => cutPictureSprites(cut, castOf(), heldEffectClock(blows, ms), PICTURED).length > 0);
    const gone = pieceGoneAt('defeat-bisect');

    expect(parted).toBeGreaterThanOrEqual(gone - 20);
    expect(parted - gone).toBeLessThan(60);
  });
});

describe('a piece crumbling', () => {
  it('lays its picture whole over the piece as the piece fades, never leaving neither on the table', () => {
    const crumbling = defeatOf('dissolve');
    const shownAt = (ms: number) =>
      Math.max(0, ...cutPictureSprites(crumbling, castOf(), ms, PICTURED).map((shard) => shard.opacity));

    for (let ms = 0; ms <= 600; ms += 20) {
      const piece = motionPoseAt('defeat-dissolve', ms)?.shown ?? 0;
      expect([ms, piece + shownAt(ms) > 0.9]).toEqual([ms, true]);
    }
  });
});
