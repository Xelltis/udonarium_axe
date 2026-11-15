import { rubbleHeavesOf } from '@axe/domain/effect/earth-looks';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { BOULDER_CELLS } from '@axe/domain/effect/scene/earth/rubble';
import { sceneLingerMsOf, stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { type EffectMote } from '@axe/domain/effect/scene/effect-scene';

const CELL = 50;
const TARGET = { x: 400, y: 300 };
const DURATION_MS = 5616;
const HEAVES_MS = rubbleHeavesOf(DURATION_MS / 1000).map((heave) => heave * 1000);

function rubbleOf(fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'rubble';
  preset.grade = 2;
  preset.durationMs = DURATION_MS;
  preset.colorPrimary = '#d8b98a';
  preset.colorSecondary = '#7a5c3d';
  Object.assign(preset, fields);
  return preset;
}

const CAST: EffectCast = {
  presetIdentifier: 'preset',
  casterIdentifier: '',
  origin: null,
  targets: [{ identifier: 't0', ...TARGET, z: 0 }],
  seed: 11,
};

function staged(preset: EffectPreset, elapsedMs: number): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, CAST, elapsedMs, { cellPx: CELL }, drawn);
  return drawn;
}

function slabsOf(drawn: Staged): EffectMote[] {
  return drawn.motes.filter((mote) => mote.shape === 'crag');
}

/** The bodies of the boulders: chunks as wide as the least of them is. */
function bouldersOf(drawn: Staged): EffectMote[] {
  return drawn.motes.filter((mote) => mote.shape === 'chunk' && mote.size >= BOULDER_CELLS[0] * CELL);
}

function glowOf(drawn: Staged): number {
  return Math.max(
    0,
    ...drawn.floor.filter((mark) => mark.shape === 'fissure' && mark.blend === 'light').map((m) => m.alpha)
  );
}

describe('rubble', () => {
  it('shakes pebbles up and runs cracks in under the target before the first heave, and throws no boulder yet', () => {
    const before = staged(rubbleOf(), HEAVES_MS[0] - 60);

    expect(bouldersOf(before)).toEqual([]);
    expect(slabsOf(before)).toEqual([]);
    expect(before.motes.filter((mote) => mote.shape === 'chunk').length).toBeGreaterThan(5);
    expect(before.floor.filter((mark) => mark.shape === 'fissure').length).toBeGreaterThan(0);
  });

  it('heaves three times, levering up more of the floor and throwing more boulders at each', () => {
    const preset = rubbleOf();
    const after = HEAVES_MS.map((heave) => staged(preset, heave + 140));
    const slabs = after.map((drawn) => slabsOf(drawn).length);
    const boulders = after.map((drawn) => bouldersOf(drawn).length);

    expect(slabs[0]).toBeGreaterThan(0);
    expect(slabs[1]).toBeGreaterThan(slabs[0]);
    expect(slabs[2]).toBeGreaterThan(slabs[1]);
    expect(boulders[0]).toBeGreaterThanOrEqual(2);
    expect(boulders[2]).toBeGreaterThanOrEqual(boulders[0] + 4);
  });

  it('opens each vent in a flash of its own with a light over it', () => {
    const preset = rubbleOf();
    for (const heave of HEAVES_MS) {
      expect(staged(preset, heave + 30).lights.length).toBeGreaterThan(0);
      expect(staged(preset, heave - 30).lights.length).toBeLessThanOrEqual(1);
    }
    expect(staged(preset, HEAVES_MS[2] + 400).lights).toEqual([]);
  });

  it('throws boulders as large as a piece high over it, which fall back and lie', () => {
    const preset = rubbleOf();
    const flying = bouldersOf(staged(preset, HEAVES_MS[0] + 450));
    const lying = bouldersOf(staged(preset, 4500));

    expect(Math.max(...flying.map((boulder) => boulder.z))).toBeGreaterThan(CELL * 1.5);
    expect(lying.length).toBeGreaterThanOrEqual(6);
    for (const boulder of lying) {
      expect(boulder.z).toBeLessThan(boulder.size);
      expect(boulder.alpha).toBe(1);
    }
  });

  it('glows red in its fissures at each heave, cools between, and leaves them dark at the end', () => {
    const preset = rubbleOf();

    expect(glowOf(staged(preset, HEAVES_MS[1] + 20))).toBeGreaterThan(glowOf(staged(preset, HEAVES_MS[1] - 20)));
    expect(glowOf(staged(preset, HEAVES_MS[2] + 1500))).toBeLessThan(glowOf(staged(preset, HEAVES_MS[2] + 20)));
    expect(glowOf(staged(preset, 5000))).toBe(0);
    expect(staged(preset, 5000).floor.filter((mark) => mark.shape === 'fissure' && mark.blend === 'color').length).toBe(
      7
    );
  });

  it('still shows its rubble, its scar and dust rising through the second half of its long playback', () => {
    const preset = rubbleOf();
    for (const ms of [3000, 4000, 5000, 5600]) {
      const drawn = staged(preset, ms);

      expect(drawn.motes.filter((mote) => mote.shape === 'chunk').length).toBeGreaterThan(60);
      expect(drawn.floor.filter((mark) => mark.shape === 'scorch').length).toBeGreaterThan(3);
    }
    expect(staged(preset, 4000).motes.some((mote) => mote.shape === 'plume')).toBe(true);
  });

  it('fades what is left as it clears, and draws nothing after', () => {
    const preset = rubbleOf();
    const ends = preset.duration + sceneLingerMsOf(preset);
    const last = staged(preset, ends - 30);

    expect(Math.max(...last.motes.map((mote) => mote.alpha))).toBeLessThan(0.1);
    expect(staged(preset, ends + 10).motes).toEqual([]);
  });
});

describe('the rubble a shot lands with', () => {
  it('is the burst of earth it was: no slabs and no boulders', () => {
    const bullet = new EffectPreset('preset');
    bullet.kind = 'projectile';
    bullet.projectileStyle = 'bullet';
    bullet.impactKind = 'rubble';
    bullet.grade = 2;
    bullet.durationMs = 750;
    for (const ms of [200, 400, 900]) {
      const drawn = staged(bullet, ms);

      expect(slabsOf(drawn)).toEqual([]);
      expect(bouldersOf(drawn)).toEqual([]);
      expect(drawn.floor.filter((mark) => mark.shape === 'fissure')).toEqual([]);
    }
  });
});
