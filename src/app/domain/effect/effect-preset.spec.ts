import {
  BoundedPresetNumber,
  boundPresetNumber,
  EffectPreset,
  PRESET_NUMBER_BOUNDS,
} from '@axe/domain/effect/effect-preset';

describe('EffectPreset', () => {
  function makePreset(): EffectPreset {
    return new EffectPreset('preset');
  }

  it('reads a kind it does not know as a burst', () => {
    const preset = makePreset();
    preset.kind = 'unknown-kind';

    expect(preset.effectKind).toBe('burst');
  });

  it('reads a look of a shot it does not know as a magic bolt, as a version from before a look was added reads it', () => {
    const preset = makePreset();
    preset.projectileStyle = 'a-look-of-a-later-version';

    expect(preset.projectileLook).toBe('bolt');
  });

  it('knows a meteor among the looks of a shot', () => {
    const preset = makePreset();
    preset.projectileStyle = 'meteor';

    expect(preset.projectileLook).toBe('meteor');
  });

  it('reads a targeting rule it does not know as a single target', () => {
    const preset = makePreset();
    preset.targeting = '';

    expect(preset.effectTargeting).toBe('single');
  });

  it('falls back to the default for a number it cannot read', () => {
    const preset = makePreset();
    preset.durationMs = Number.NaN;
    preset.scale = Number.NaN;

    expect(preset.duration).toBe(900);
    expect(preset.sizeScale).toBe(1);
  });

  it('stops too long a playback and too large a scale at their limits', () => {
    const preset = makePreset();
    preset.durationMs = 999999;
    preset.scale = 100;

    expect(preset.duration).toBe(6000);
    expect(preset.sizeScale).toBe(6);
  });

  it('holds a single-target effect to one', () => {
    const preset = makePreset();
    preset.targeting = 'single';
    preset.maxTargets = 8;

    expect(preset.targetLimit).toBe(1);
  });

  it('takes the limit it is given for one that takes several', () => {
    const preset = makePreset();
    preset.targeting = 'multi';
    preset.maxTargets = 8;

    expect(preset.targetLimit).toBe(8);
  });

  it('lengthens the whole by the stagger between the targets', () => {
    const preset = makePreset();
    preset.durationMs = 500;
    preset.staggerMs = 100;

    expect(preset.totalDuration(1)).toBe(500);
    expect(preset.totalDuration(3)).toBe(700);
    expect(preset.totalDuration(0)).toBe(500);
  });

  describe('an effect built of stages', () => {
    it('draws one look while it keeps no stages', () => {
      const preset = makePreset();

      expect(preset.isStaged).toBe(false);
      expect(preset.stageList).toEqual([]);
    });

    it('reads the stages it was given', () => {
      const preset = makePreset();
      preset.stages = JSON.stringify([
        { role: 'travel', kind: 'projectile', durationMs: 600 },
        { role: 'impact', kind: 'frost', durationMs: 400 },
      ]);

      expect(preset.isStaged).toBe(true);
      expect(preset.stageList.map((stage) => stage.kind)).toEqual(['projectile', 'frost']);
    });

    it('runs for as long as the stages take rather than the written length', () => {
      const preset = makePreset();
      preset.durationMs = 900;
      preset.stages = JSON.stringify([
        { role: 'travel', kind: 'projectile', durationMs: 600 },
        { role: 'impact', kind: 'frost', durationMs: 400 },
      ]);

      expect(preset.duration).toBe(1000);
    });

    it('reads them again once they change', () => {
      const preset = makePreset();
      preset.stages = JSON.stringify([{ role: 'impact', kind: 'frost', durationMs: 400 }]);
      expect(preset.stageList).toHaveLength(1);

      preset.stages = JSON.stringify([
        { role: 'impact', kind: 'frost', durationMs: 400 },
        { role: 'field', kind: 'flame', durationMs: 800 },
      ]);

      expect(preset.stageList).toHaveLength(2);
    });

    it('goes on drawing its one look for a list it cannot read', () => {
      const preset = makePreset();
      preset.stages = '{';

      expect(preset.isStaged).toBe(false);
      expect(preset.duration).toBe(preset.durationMs);
    });
  });

  describe('the bounds its numbers are held to', () => {
    const READ: readonly [BoundedPresetNumber, (preset: EffectPreset) => number][] = [
      ['durationMs', (preset) => preset.duration],
      ['staggerMs', (preset) => preset.stagger],
      ['scale', (preset) => preset.sizeScale],
      ['maxTargets', (preset) => preset.targetLimit],
      ['areaRadius', (preset) => preset.areaRadiusCells],
      ['grade', (preset) => preset.gradeLevel],
      ['shots', (preset) => preset.shotCount],
      ['shotInterval', (preset) => preset.shotIntervalMs],
    ];

    it.each(READ)('are the ones %s is played within', (key, read) => {
      const preset = new EffectPreset();
      preset.targeting = 'multi';

      preset[key] = 99999;
      expect(read(preset)).toBe(PRESET_NUMBER_BOUNDS[key].max);
      preset[key] = -99999;
      expect(read(preset)).toBe(PRESET_NUMBER_BOUNDS[key].min);
    });

    it('hold a number written, whole where it is whole, and take nothing but a number', () => {
      expect(boundPresetNumber('scale', 10)).toBe(PRESET_NUMBER_BOUNDS.scale.max);
      expect(boundPresetNumber('scale', '1.5')).toBe(1.5);
      expect(boundPresetNumber('shots', 3.6)).toBe(4);
      expect(boundPresetNumber('shotInterval', null)).toBeNull();
      expect(boundPresetNumber('shotInterval', '')).toBeNull();
    });
  });
});
