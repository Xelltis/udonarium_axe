import { EffectCast } from '@axe/domain/effect/effect-cast';
import { EFFECT_KINDS, EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import {
  AIMED_EFFECT_KINDS,
  CENTERED_EFFECT_KINDS,
  cutPictureSprites,
  type EffectSpriteOptions,
  isAimed,
} from '@axe/domain/effect/effect-timeline';

function makePreset(kind: EffectKind, staggerMs = 0): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = kind;
  preset.durationMs = 1000;
  preset.staggerMs = staggerMs;
  return preset;
}

function makeCast(targetCount = 1): EffectCast {
  return {
    presetIdentifier: 'preset',
    casterIdentifier: '',
    origin: null,
    seed: 7,
    targets: Array.from({ length: targetCount }, (_unused, index) => ({
      identifier: `char${index}`,
      x: index * 100,
      y: 0,
      z: 0,
    })),
  };
}

const PICTURED: EffectSpriteOptions = { baseSize: 50, resolveImage: () => 'blob:token' };

describe('cutPictureSprites()', () => {
  it('cuts the picture of a piece crumbling apart into a grid, and scatters the fragments', () => {
    const pieces = cutPictureSprites(makePreset('dissolve'), makeCast(), 600, PICTURED);

    expect(pieces.length).toBeGreaterThan(8);
    for (const piece of pieces) {
      expect(piece.background).toContain('blob:token');
      expect(piece.clipPath).toContain('inset(');
    }
    expect(new Set(pieces.map((piece) => `${piece.offsetX}/${piece.offsetY}`)).size).toBe(pieces.length);
  });

  it('cuts the picture of a piece cleaved in two and slides the halves apart, once the stroke has passed', () => {
    expect(cutPictureSprites(makePreset('bisect'), makeCast(), 100, PICTURED)).toEqual([]);

    const halves = cutPictureSprites(makePreset('bisect'), makeCast(), 700, PICTURED);

    expect(halves.map((half) => half.key)).toEqual(['0-bisect-upper', '0-bisect-lower']);
    expect(halves[0].clipPath).toContain('polygon(');
    expect(Math.sign(halves[0].offsetX)).not.toBe(Math.sign(halves[1].offsetX));
  });

  it('cuts nothing of a piece with no picture, nor for a look that cuts none', () => {
    expect(cutPictureSprites(makePreset('dissolve'), makeCast(), 600, { baseSize: 50 })).toEqual([]);
    for (const kind of EFFECT_KINDS.filter((each) => each !== 'dissolve' && each !== 'bisect')) {
      expect([kind, cutPictureSprites(makePreset(kind), makeCast(), 500, PICTURED)]).toEqual([kind, []]);
    }
  });

  it('cuts nothing before it starts or after it ends, and the later targets after the stagger', () => {
    const preset = makePreset('dissolve', 300);

    expect(cutPictureSprites(preset, makeCast(2), -10, PICTURED)).toEqual([]);
    expect(cutPictureSprites(preset, makeCast(2), 1400, PICTURED)).toEqual([]);
    const early = cutPictureSprites(preset, makeCast(2), 250, PICTURED);
    expect(early.length).toBeGreaterThan(0);
    expect(early.every((piece) => piece.key.startsWith('0-'))).toBe(true);
  });

  it('cuts nothing of a target out of sight', () => {
    const hidden = { ...PICTURED, hiddenIdentifiers: new Set(['char0']) };

    expect(cutPictureSprites(makePreset('dissolve'), makeCast(), 600, hidden)).toEqual([]);
  });

  it('cuts a picture where a run’s stage cuts it', () => {
    const run = makePreset('burst');
    run.stages = JSON.stringify([
      { role: 'impact', kind: 'burst', durationMs: 400 },
      { role: 'impact', kind: 'dissolve', durationMs: 800 },
    ]);

    expect(cutPictureSprites(run, makeCast(), 200, PICTURED)).toEqual([]);
    expect(cutPictureSprites(run, makeCast(), 900, PICTURED).length).toBeGreaterThan(0);
  });

  it('is the same at the same moment from the same seed', () => {
    const preset = makePreset('dissolve');

    expect(cutPictureSprites(preset, makeCast(), 600, PICTURED)).toEqual(
      cutPictureSprites(preset, makeCast(), 600, PICTURED)
    );
  });
});

describe('the kinds of look', () => {
  it('fires the looks that need an origin from the caster, and sets the rest off about the target', () => {
    expect(isAimed(makePreset('projectile'))).toBe(true);
    expect(isAimed(makePreset('burst'))).toBe(false);
    expect(AIMED_EFFECT_KINDS.filter((kind) => CENTERED_EFFECT_KINDS.includes(kind))).toEqual([]);
    expect(
      EFFECT_KINDS.filter((kind) => !AIMED_EFFECT_KINDS.includes(kind) && !CENTERED_EFFECT_KINDS.includes(kind))
    ).toEqual(['burst']);
  });
});
