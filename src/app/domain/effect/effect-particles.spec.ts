import { EFFECT_KINDS, EffectKind } from '@axe/domain/effect/effect-kind';
import { effectParticles, PARTICLE_EFFECT_KINDS, seededRandom } from '@axe/domain/effect/effect-particles';
import { EffectPreset } from '@axe/domain/effect/effect-preset';

describe('effectParticles()', () => {
  function makePreset(kind: EffectKind): EffectPreset {
    const preset = new EffectPreset('preset');
    preset.kind = kind;
    preset.durationMs = 1000;
    preset.colorPrimary = '#ffd27f';
    preset.colorSecondary = '#ff5a33';
    return preset;
  }

  const base = 50;

  it('returns particles through the height of every kind', () => {
    // The kinds that show nothing at the target until they arrive are checked apart.
    const flying: EffectKind[] = ['projectile', 'beam', 'skyblade', 'arrowrain', 'ballistic'];
    for (const kind of EFFECT_KINDS.filter((candidate) => !flying.includes(candidate))) {
      for (const progress of [0.3, 0.6]) {
        const layer = effectParticles(makePreset(kind), 7, progress, base);
        expect(layer.particles.length).toBeGreaterThan(0);
      }
    }
  });

  it('does not sink the screen in smoke', () => {
    // Smoke spreads over the whole canvas, and made as large and thick as the effect is the
    // screen itself goes dark. With several targets the canvases overlap, so each is kept light.
    const darkestSmoke = (kind: EffectKind, scale: number): number => {
      const preset = makePreset(kind);
      preset.grade = 3;
      preset.scale = scale;
      let worst = 0;
      for (let step = 1; step < 20; step++) {
        const layer = effectParticles(preset, 7, step / 20, base * scale);
        const covered = layer.particles
          .filter((particle) => particle.shape === 'smoke')
          .reduce((sum, particle) => sum + Math.PI * (particle.size / 2) ** 2 * particle.alpha, 0);
        worst = Math.max(worst, covered / (layer.width * layer.height));
      }
      return worst;
    };

    // An explosion is its flash, not a covering of smoke.
    expect(darkestSmoke('nova', 1.8)).toBeLessThan(0.2);
    expect(darkestSmoke('burst', 1.4)).toBeLessThan(0.2);
    // Even where the smoke is the point, it stops short of covering everything.
    for (const kind of EFFECT_KINDS) expect(darkestSmoke(kind, 1.9)).toBeLessThan(0.45);
  });

  it('shows nothing at the target until the breath arrives', () => {
    // Burning before it is breathed on is a lie.
    expect(effectParticles(makePreset('breath'), 7, 0.1, base).particles).toHaveLength(0);
    expect(effectParticles(makePreset('breath'), 7, 0.5, base).particles.length).toBeGreaterThan(0);
  });

  it('shows nothing there until the beam arrives', () => {
    // This layer sits over the target, and showing it while the beam gathers lands the shot before it is fired.
    expect(effectParticles(makePreset('beam'), 7, 0.15, base).particles).toHaveLength(0);
    expect(effectParticles(makePreset('beam'), 7, 0.6, base).particles.length).toBeGreaterThan(0);
  });

  it('keeps the feet of the target inside the canvas', () => {
    const layer = effectParticles(makePreset('flame'), 7, 0.5, base);

    expect(layer.originX).toBeGreaterThan(0);
    expect(layer.originX).toBeLessThan(layer.width);
    expect(layer.originY).toBeGreaterThan(0);
    expect(layer.originY).toBeLessThan(layer.height);
  });

  it('returns the same particles from the same seed', () => {
    for (const kind of EFFECT_KINDS) {
      const first = effectParticles(makePreset(kind), 11, 0.4, base);
      const second = effectParticles(makePreset(kind), 11, 0.4, base);

      expect(first).toEqual(second);
    }
  });

  it('arranges them differently from another', () => {
    const first = effectParticles(makePreset('burst'), 1, 0.4, base);
    const second = effectParticles(makePreset('burst'), 2, 0.4, base);

    expect(first.particles).not.toEqual(second.particles);
  });

  it('keeps every opacity between none and full', () => {
    for (const kind of EFFECT_KINDS) {
      for (const progress of [0.02, 0.5, 0.99]) {
        for (const particle of effectParticles(makePreset(kind), 3, progress, base).particles) {
          expect(particle.alpha).toBeGreaterThanOrEqual(0);
          expect(particle.alpha).toBeLessThanOrEqual(1);
          expect(particle.size).toBeGreaterThan(0);
        }
      }
    }
  });

  it('gives white light at the foot of a flame and burns as darker colour towards the top', () => {
    const layer = effectParticles(makePreset('flame'), 5, 0.5, base);
    const hottest = layer.particles.filter((particle) => particle.shape === 'glow' && particle.color === '#ffffff');
    const cool = layer.particles.filter((particle) => particle.shape === 'puff' && particle.color === '#ff5a33');

    expect(hottest.length).toBeGreaterThan(0);
    expect(cool.length).toBeGreaterThan(0);
    const meanY = (list: typeof hottest) => list.reduce((sum, particle) => sum + particle.y, 0) / list.length;
    expect(meanY(hottest)).toBeGreaterThan(meanY(cool));
  });

  it('lays the body of a fireball as colour, giving light only from a heart no wider than a few cells', () => {
    for (const kind of ['burst', 'nova', 'mushroom'] as const) {
      for (const progress of [0.02, 0.1, 0.3, 0.6]) {
        const layer = effectParticles(makePreset(kind), 3, progress, base);
        const widestLight = Math.max(0, ...layer.particles.filter((p) => p.shape === 'glow').map((p) => p.size));
        expect(widestLight).toBeLessThanOrEqual(base * 3.2);
      }
    }
    const body = effectParticles(makePreset('nova'), 3, 0.3, base).particles.filter((p) => p.shape === 'puff');
    expect(body.length).toBeGreaterThan(0);
  });

  it('spreads the sparks of an explosion over time', () => {
    const spreadAt = (progress: number) => {
      const layer = effectParticles(makePreset('burst'), 9, progress, base);
      const streaks = layer.particles.filter((particle) => particle.shape === 'streak');
      return Math.max(...streaks.map((particle) => Math.abs(particle.x)));
    };

    expect(spreadAt(0.6)).toBeGreaterThan(spreadAt(0.15));
  });

  it('shows the particles of a projectile only once it lands', () => {
    const preset = makePreset('projectile');

    expect(effectParticles(preset, 7, 0.2, base).particles).toHaveLength(0);
    expect(effectParticles(preset, 7, 0.7, base).particles.length).toBeGreaterThan(0);
  });

  it('changes what it does on landing by its element', () => {
    const preset = makePreset('projectile');
    preset.impactKind = 'rubble';

    // A landing that breaks rock mixes in fragments drawn as solid things.
    expect(effectParticles(preset, 7, 0.8, base).particles.some((particle) => particle.shape === 'chunk')).toBe(true);
  });

  it('throws sparks from each stroke of a combination', () => {
    const preset = makePreset('slash');
    preset.slashStyle = 'combo';

    // Through five strokes there are sparks at every moment.
    for (const progress of [0.1, 0.35, 0.6, 0.85]) {
      expect(effectParticles(preset, 7, progress, base).particles.length).toBeGreaterThan(0);
    }
  });

  it('returns the smoke separately, to be laid down plainly', () => {
    const layer = effectParticles(makePreset('flame'), 5, 0.6, base);

    expect(layer.particles.some((particle) => particle.shape === 'smoke')).toBe(true);
  });

  it('bursts a great sword at the target only after it falls', () => {
    const countAt = (progress: number) => effectParticles(makePreset('skyblade'), 3, progress, base).particles.length;

    // Bursting while the blade gathers makes the target burst before it is struck.
    expect(countAt(0.2)).toBe(0);
    expect(countAt(0.6)).toBe(0);
    expect(countAt(0.8)).toBeGreaterThan(0);
  });

  it('bursts one with an element in that element', () => {
    const blade = makePreset('skyblade');
    blade.impactKind = 'frost';
    const light = effectParticles(makePreset('skyblade'), 3, 0.8, base).particles;
    const frost = effectParticles(blade, 3, 0.8, base).particles;

    expect(frost.length).toBeGreaterThan(0);
    expect(frost).not.toEqual(light);
  });

  it('bursts a ballistic shot only once it comes down', () => {
    const countAt = (progress: number) => effectParticles(makePreset('ballistic'), 3, progress, base).particles.length;

    // Showing it on the way up bursts the target before the shot is fired.
    expect(countAt(0.3)).toBe(0);
    expect(countAt(0.8)).toBe(0);
    expect(countAt(0.95)).toBeGreaterThan(0);
  });

  it('raises the dust of falling arrows only once they strike', () => {
    const countAt = (progress: number) => effectParticles(makePreset('arrowrain'), 3, progress, base).particles.length;

    expect(countAt(0.1)).toBe(0);
    expect(countAt(0.6)).toBeGreaterThan(0);
  });
});

describe('seededRandom()', () => {
  it('returns the same sequence from the same seed', () => {
    const first = seededRandom(99);
    const second = seededRandom(99);

    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });
});

describe('which kind gets which particles', () => {
  it('leaves out of the table only the kinds that show none', () => {
    // Anything not in the table falls back to bursting; only what uses no canvas in flight belongs here.
    const unrouted = EFFECT_KINDS.filter((kind) => !PARTICLE_EFFECT_KINDS.includes(kind));

    expect(unrouted.sort()).toEqual(['arrowrain', 'ballistic', 'burst', 'projectile', 'raybeam', 'skyblade']);
  });
});
