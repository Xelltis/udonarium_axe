import { ObjectStore } from '@axe/core/sync/object-store';
import { createEffectPreset, DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { effectShakeOf } from '@axe/domain/effect/effect-shake';
import { nothingStaged, type Staged } from '@axe/domain/effect/scene/choreography';
import { stageEffect } from '@axe/domain/effect/scene/effect-frame';

const CELL = 50;

function bundled(name: string): EffectPreset {
  return createEffectPreset(DEFAULT_EFFECT_PRESET_SEEDS.find((seed) => seed.name === name)!);
}

function drawnAt(preset: EffectPreset, cast: EffectCast, ms: number): Staged {
  const drawn = nothingStaged();
  stageEffect(preset, cast, ms, { cellPx: CELL }, drawn);
  return drawn;
}

/** The marks of a crack's depths, which are what a rift or a quake tears in the floor. */
function gashes(drawn: Staged) {
  return drawn.floor.filter((mark) => mark.shape === 'fissure' && mark.color === '#1d130c');
}

describe('a rift', () => {
  const cast: EffectCast = {
    presetIdentifier: 'rift',
    casterIdentifier: 'caster',
    origin: { x: 0, y: 300, z: 30 },
    targets: [{ identifier: 'target', x: 400, y: 300, z: 0 }],
    seed: 7,
  };

  it('tears the ground from before its caster towards the target, and reaches the target as it strikes', () => {
    const preset = bundled('地割れ');
    try {
      const strikesAt = effectBlowsOf(preset)[0].atMs;
      const running = gashes(drawnAt(preset, cast, strikesAt * 0.5));
      const reached = gashes(drawnAt(preset, cast, strikesAt + 150));

      expect(running.length).toBeGreaterThan(0);
      expect(Math.max(...running.map((mark) => mark.x))).toBeLessThan(300);
      expect(Math.min(...running.map((mark) => mark.x))).toBeLessThan(100);
      expect(Math.max(...reached.map((mark) => mark.x + mark.radius))).toBeGreaterThan(400);
    } finally {
      ObjectStore.instance.remove(preset);
    }
  });

  it('strikes once, and shakes the screen lightly as the middle grade does', () => {
    const preset = bundled('地割れ');
    try {
      expect(effectBlowsOf(preset)).toHaveLength(1);
      expect(effectShakeOf(preset)).toBe('soft');
    } finally {
      ObjectStore.instance.remove(preset);
    }
  });

  it('leaves its crack cooling on the floor long after it struck', () => {
    const preset = bundled('地割れ');
    try {
      const late = drawnAt(preset, cast, preset.duration - 100);

      expect(gashes(late).length).toBeGreaterThan(3);
    } finally {
      ObjectStore.instance.remove(preset);
    }
  });
});

describe('a quake over an area', () => {
  const cast: EffectCast = {
    presetIdentifier: 'quake',
    casterIdentifier: 'caster',
    origin: { x: 0, y: 300, z: 30 },
    targets: [
      { identifier: 'middle', x: 400, y: 300, z: 0 },
      { identifier: 'caught', x: 480, y: 340, z: 0 },
    ],
    seed: 11,
  };

  it('heaves three times, the first held as a blow of its grade and the screen shaken hard', () => {
    const preset = bundled('大地震');
    try {
      const blows = effectBlowsOf(preset);

      expect(blows).toHaveLength(3);
      expect(blows[0].holdMs).toBeGreaterThan(blows[1].holdMs);
      expect(blows.every((blow) => blow.shake === 'hard')).toBe(true);
    } finally {
      ObjectStore.instance.remove(preset);
    }
  });

  it('races a ring out over the floor of the area at each heave, and tears another crack across it', () => {
    const preset = bundled('大地震');
    try {
      const blows = effectBlowsOf(preset);
      const before = gashes(drawnAt(preset, cast, blows[1].atMs - 60)).length;
      const after = drawnAt(preset, cast, blows[1].atMs + 250);
      const rings = after.floor.filter((mark) => mark.shape === 'ring' && mark.radius > CELL * 1.2);

      expect(rings.length).toBeGreaterThan(0);
      expect(gashes(after).length).toBeGreaterThan(before);
    } finally {
      ObjectStore.instance.remove(preset);
    }
  });

  it('cracks the floor under a piece it has caught as well as at its middle', () => {
    const preset = bundled('大地震');
    try {
      const blows = effectBlowsOf(preset);
      const drawn = drawnAt(preset, cast, blows[0].atMs + 400);
      const near = (x: number, y: number) =>
        gashes(drawn).filter((mark) => Math.hypot(mark.x - x, mark.y - y) < CELL * 1.2).length;

      expect(near(480, 340)).toBeGreaterThan(0);
    } finally {
      ObjectStore.instance.remove(preset);
    }
  });

  it('turns white at every heave for long enough to be seen, before its slabs land and its dust rises', () => {
    const preset = bundled('大地震');
    try {
      for (const blow of effectBlowsOf(preset)) {
        const white = drawnAt(preset, cast, blow.atMs + 100).motes.filter(
          (mote) => mote.blend === 'light' && mote.shape === 'puff' && mote.size > CELL
        );

        expect(white.length).toBeGreaterThan(0);
      }
    } finally {
      ObjectStore.instance.remove(preset);
    }
  });
});
