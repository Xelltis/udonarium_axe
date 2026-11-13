import { EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectKind } from '@axe/domain/effect/effect-kind';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import {
  effectLandingTimes,
  impactSoundTimes,
  isEffectFinished,
  launchSoundTimes,
} from '@axe/domain/effect/effect-sound-times';

describe('effectLandingTimes()', () => {
  it('finds where the blow lands for an effect that sounds nothing there', () => {
    const preset = new EffectPreset('preset');
    preset.kind = 'projectile';
    preset.durationMs = 1000;
    preset.impactSoundIdentifier = '';

    expect(impactSoundTimes(preset)).toEqual([]);
    expect(effectLandingTimes(preset)).toEqual([340]);
  });

  it('lands an effect about the target partway through it', () => {
    const preset = new EffectPreset('preset');
    preset.kind = 'slash';
    preset.durationMs = 1000;

    expect(effectLandingTimes(preset)).toEqual([500]);
  });
});

describe('impactSoundTimes()', () => {
  function makePreset(kind: EffectKind, duration: number): EffectPreset {
    const preset = new EffectPreset('preset');
    preset.kind = kind;
    preset.durationMs = duration;
    preset.impactSoundIdentifier = 'se-impact';
    return preset;
  }

  it('sounds nothing when there is no landing sound', () => {
    const preset = makePreset('projectile', 1000);
    preset.impactSoundIdentifier = '';

    expect(impactSoundTimes(preset)).toEqual([]);
  });

  it('sounds a single shot once, as it lands', () => {
    expect(impactSoundTimes(makePreset('projectile', 1000))).toEqual([340]);
  });

  it('sets the speed of a shot by real time rather than by the length of the effect', () => {
    const quick = makePreset('projectile', 800);
    const long = makePreset('projectile', 4000);

    // Five times the length leaves the time to the landing unchanged.
    expect(impactSoundTimes(quick)[0]).toBe(impactSoundTimes(long)[0]);
  });

  it('fires a burst through at the interval it is given', () => {
    const preset = makePreset('projectile', 3000);
    preset.projectileStyle = 'bullet';
    preset.shots = 10;
    preset.shotInterval = 90;
    const times = impactSoundTimes(preset);

    // Ten shots at that interval finish inside a second, however long the effect runs.
    expect(times).toHaveLength(10);
    expect(times[1] - times[0]).toBe(90);
    expect(times[times.length - 1]).toBeLessThan(1100);
  });

  it('closes the interval up when it will not fit', () => {
    const preset = makePreset('projectile', 600);
    preset.projectileStyle = 'bullet';
    preset.shots = 10;
    preset.shotInterval = 400;
    const times = impactSoundTimes(preset);

    // As given it would run past the end, so it is closed up until it fits.
    expect(times[times.length - 1]).toBeLessThanOrEqual(600);
  });

  it('flies a bullet faster than a magical bolt', () => {
    const bolt = makePreset('projectile', 1000);
    const bullet = makePreset('projectile', 1000);
    bullet.projectileStyle = 'bullet';

    expect(impactSoundTimes(bullet)[0]).toBeLessThan(impactSoundTimes(bolt)[0]);
  });

  it('sounds each shot of a burst', () => {
    const preset = makePreset('projectile', 2000);
    preset.shots = 5;

    // One landing for a hail of shots is not enough sound.
    expect(impactSoundTimes(preset)).toHaveLength(5);
  });

  it('thins them where they come too close together', () => {
    const preset = makePreset('projectile', 600);
    preset.shots = 20;
    const times = impactSoundTimes(preset);

    // A shortest interval is kept, so the same sound does not pile up and cancel itself.
    for (let index = 1; index < times.length; index++) {
      expect(times[index] - times[index - 1]).toBeGreaterThanOrEqual(70);
    }
    expect(times.length).toBeLessThan(20);
  });

  it('sounds anything that does not fly once', () => {
    expect(impactSoundTimes(makePreset('bash', 1000))).toHaveLength(1);
  });
});

describe('the sounds of a run built of stages', () => {
  function makeRun(stages: unknown[]): EffectPreset {
    const preset = new EffectPreset('preset');
    preset.kind = 'burst';
    preset.soundIdentifier = 'se-shot';
    preset.impactSoundIdentifier = 'se-impact';
    preset.stages = JSON.stringify(stages);
    return preset;
  }

  it('sounds a shot as each stage that travels starts', () => {
    const preset = makeRun([
      { role: 'travel', kind: 'projectile', durationMs: 600 },
      { role: 'impact', kind: 'burst', durationMs: 400 },
      { role: 'travel', kind: 'projectile', durationMs: 500 },
    ]);

    expect(launchSoundTimes(preset)).toEqual([0, 1000]);
  });

  it('sounds a landing as each stage that lands starts', () => {
    const preset = makeRun([
      { role: 'travel', kind: 'projectile', durationMs: 600 },
      { role: 'impact', kind: 'burst', durationMs: 400 },
    ]);

    expect(impactSoundTimes(preset)).toEqual([600]);
  });

  it('sounds the branches of a spawn once rather than one apiece', () => {
    // They all start together, and one sound each would be a single noise.
    const preset = makeRun([
      {
        role: 'spawn',
        kind: 'burst',
        durationMs: 100,
        branches: 4,
        children: [{ role: 'impact', kind: 'frost', durationMs: 300 }],
      },
    ]);

    expect(impactSoundTimes(preset)).toEqual([0]);
  });

  it('sounds the shot at the start for a run that travels nowhere', () => {
    const preset = makeRun([{ role: 'impact', kind: 'burst', durationMs: 400 }]);

    expect(launchSoundTimes(preset)).toEqual([0]);
  });

  it('sounds the landing where the travelling stops for a run that lands nowhere', () => {
    const preset = makeRun([
      { role: 'travel', kind: 'projectile', durationMs: 600 },
      { role: 'travel', kind: 'projectile', durationMs: 300 },
    ]);

    expect(impactSoundTimes(preset)).toEqual([900]);
  });

  it('sounds the landing as it opens for a run that only leaves something behind', () => {
    const preset = makeRun([{ role: 'field', kind: 'flame', durationMs: 2000 }]);

    expect(impactSoundTimes(preset)).toEqual([0]);
  });
});

describe('isEffectFinished()', () => {
  it('counts it finished only once every target has played through', () => {
    const preset = new EffectPreset('preset');
    preset.durationMs = 500;
    preset.staggerMs = 200;
    const cast: EffectCast = {
      presetIdentifier: 'preset',
      casterIdentifier: '',
      origin: null,
      seed: 0,
      targets: [
        { identifier: 'a', x: 0, y: 0, z: 0 },
        { identifier: 'b', x: 0, y: 0, z: 0 },
      ],
    };

    expect(isEffectFinished(preset, cast, 600)).toBe(false);
    expect(isEffectFinished(preset, cast, 700)).toBe(true);
  });
});

describe('launchSoundTimes()', () => {
  function preset(overrides: Partial<Record<string, unknown>> = {}): EffectPreset {
    const made = new EffectPreset('launch-sound-test');
    Object.assign(made, {
      kind: 'projectile',
      projectileStyle: 'blaster',
      durationMs: 1200,
      soundIdentifier: 'shot',
      impactSoundIdentifier: 'hit',
      shots: 1,
      shotInterval: 0,
      ...overrides,
    });
    return made;
  }

  it('sounds each shot', () => {
    const times = launchSoundTimes(preset({ shots: 6, shotInterval: 110 }));

    expect(times).toHaveLength(6);
    expect(times[0]).toBe(0);
    expect(times.every((at, index) => index === 0 || at > times[index - 1])).toBe(true);
  });

  it('sounds a single shot once', () => {
    expect(launchSoundTimes(preset())).toEqual([0]);
  });

  it('thins the shots where they come too close together', () => {
    const times = launchSoundTimes(preset({ shots: 40, shotInterval: 1, durationMs: 300 }));
    expect(times.length).toBeLessThan(40);
  });

  it('sounds anything that does not fly once, as it starts', () => {
    expect(launchSoundTimes(preset({ kind: 'raybeam' }))).toEqual([0]);
  });

  it('returns nothing when there is no sound to make', () => {
    expect(launchSoundTimes(preset({ soundIdentifier: '' }))).toEqual([]);
  });
});
