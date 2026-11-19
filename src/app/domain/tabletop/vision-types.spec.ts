import {
  applyLightPreset,
  applyLightPresetWith,
  LIGHT_PRESETS,
  LightAnimation,
  LightCategory,
  LightPreset,
  lightSpecFromPreset,
  MutableLightFields,
  VisionType,
} from '@axe/domain/tabletop/vision-types';

describe('vision-types', () => {
  describe('VisionType enum', () => {
    it('offers five kinds of sight', () => {
      expect(VisionType.NORMAL).toBe('normal');
      expect(VisionType.DARKVISION).toBe('darkvision');
      expect(VisionType.TRUESIGHT).toBe('truesight');
      expect(VisionType.BLIND).toBe('blind');
      expect(VisionType.THERMAL).toBe('thermal');
    });
  });

  describe('LIGHT_PRESETS', () => {
    it('defines every preset but the custom one', () => {
      const keys = Object.keys(LIGHT_PRESETS);
      expect(keys).toContain(LightPreset.TORCH);
      expect(keys).toContain(LightPreset.SPOTLIGHT);
      expect(keys).not.toContain(LightPreset.CUSTOM);
    });

    it('a spotlight is theatrical: it ignores obstacles, everybody sees it and it casts shadows', () => {
      const def = LIGHT_PRESETS[LightPreset.SPOTLIGHT];
      expect(def.category).toBe(LightCategory.THEATRICAL);
      expect(def.ignoreOcclusion).toBe(true);
      expect(def.revealToAll).toBe(true);
      expect(def.castShadows).toBe(true);
      expect(def.angle).toBeLessThan(360);
    });

    it('a neon light animates as neon', () => {
      expect(LIGHT_PRESETS[LightPreset.NEON].animation).toBe(LightAnimation.NEON);
    });

    it('a torch is a cone rather than a full turn', () => {
      expect(LIGHT_PRESETS[LightPreset.FLASHLIGHT].angle).toBeLessThan(360);
    });

    it('the cones start pitched down and the spheres level', () => {
      expect(LIGHT_PRESETS[LightPreset.FLASHLIGHT].pitch).toBe(-30);
      expect(LIGHT_PRESETS[LightPreset.SPOTLIGHT].pitch).toBe(-30);
      expect(LIGHT_PRESETS[LightPreset.TORCH].pitch).toBe(0);
    });
  });

  describe('lightSpecFromPreset()', () => {
    it('returns a specification built from the preset', () => {
      const spec = lightSpecFromPreset(LightPreset.TORCH);
      const def = LIGHT_PRESETS[LightPreset.TORCH];
      expect(spec.preset).toBe(LightPreset.TORCH);
      expect(spec.brightRadius).toBe(def.brightRadius);
      expect(spec.dimRadius).toBe(def.dimRadius);
      expect(spec.enabled).toBe(true);
    });

    it('applies no preset to a custom light', () => {
      const spec = lightSpecFromPreset(LightPreset.CUSTOM);
      expect(spec.preset).toBe(LightPreset.CUSTOM);
      expect(spec.brightRadius).toBe(0);
      expect(spec.category).toBe(LightCategory.PHYSICAL);
    });

    it('the overrides win over everything', () => {
      const spec = lightSpecFromPreset(LightPreset.TORCH, { brightRadius: 99, color: '#123456' });
      expect(spec.brightRadius).toBe(99);
      expect(spec.color).toBe('#123456');
    });
  });

  describe('applyLightPreset()', () => {
    it('writes the preset onto the basic fields', () => {
      const target: MutableLightFields = {
        lightPreset: LightPreset.CUSTOM,
        lightBrightRadius: 0,
        lightDimRadius: 0,
        lightColor: '#000000',
        lightAngle: 360,
        lightAnimation: LightAnimation.NONE,
      };
      applyLightPreset(target, LightPreset.LANTERN);
      const def = LIGHT_PRESETS[LightPreset.LANTERN];
      expect(target.lightPreset).toBe(LightPreset.LANTERN);
      expect(target.lightBrightRadius).toBe(def.brightRadius);
      expect(target.lightDimRadius).toBe(def.dimRadius);
      expect(target.lightColor).toBe(def.color);
    });

    it('writes onto the advanced ones as well where they exist', () => {
      const target: MutableLightFields = {
        lightPreset: LightPreset.CUSTOM,
        lightBrightRadius: 0,
        lightDimRadius: 0,
        lightColor: '#000000',
        lightAngle: 360,
        lightAnimation: LightAnimation.NONE,
        lightCategory: LightCategory.PHYSICAL,
        lightIgnoreOcclusion: false,
        lightRevealToAll: false,
        lightCastShadows: false,
      };
      applyLightPreset(target, LightPreset.SPOTLIGHT);
      expect(target.lightCategory).toBe(LightCategory.THEATRICAL);
      expect(target.lightIgnoreOcclusion).toBe(true);
      expect(target.lightRevealToAll).toBe(true);
      expect(target.lightCastShadows).toBe(true);
    });

    it('writes nothing for a custom light', () => {
      const target: MutableLightFields = {
        lightPreset: LightPreset.TORCH,
        lightBrightRadius: 4,
        lightDimRadius: 8,
        lightColor: '#ffb36b',
        lightAngle: 360,
        lightAnimation: LightAnimation.FLICKER,
      };
      applyLightPreset(target, LightPreset.CUSTOM);
      expect(target.lightPreset).toBe(LightPreset.CUSTOM);
      expect(target.lightBrightRadius).toBe(4);
    });
  });
});

describe('a preset laid on a light with what is asked of it beyond', () => {
  it('stays the preset where its motion is the preset’s, and is a light of its own where the motion differs', () => {
    const light = () => ({
      lightPreset: '',
      lightBrightRadius: 0,
      lightDimRadius: 0,
      lightColor: '',
      lightAngle: 0,
      lightAnimation: '',
    });
    const torch = light();
    applyLightPresetWith(torch, LightPreset.TORCH, {});
    expect(torch.lightPreset).toBe(LightPreset.TORCH);

    const still = light();
    applyLightPresetWith(still, LightPreset.TORCH, { animation: 'none' });
    expect(still).toMatchObject({ lightPreset: LightPreset.CUSTOM, lightAnimation: 'none' });

    const tinted = light();
    applyLightPresetWith(tinted, LightPreset.TORCH, { color: '#00ff00' });
    expect(tinted).toMatchObject({ lightPreset: LightPreset.TORCH, lightColor: '#00ff00' });
  });
});
