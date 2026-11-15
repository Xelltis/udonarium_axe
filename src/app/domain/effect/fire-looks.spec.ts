import { createEffectPreset, DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { isFireShot } from '@axe/domain/effect/fire-looks';

function shotOf(fields: Partial<EffectPreset> = {}): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'projectile';
  preset.tagName = '射撃';
  preset.colorPrimary = '#ffd27f';
  preset.colorSecondary = '#ff6a2b';
  Object.assign(preset, fields);
  return preset;
}

describe('isFireShot()', () => {
  it('takes a bolt of the colour of flame that lands in fire for a shot of fire', () => {
    expect(isFireShot(shotOf())).toBe(true);
    expect(isFireShot(shotOf({ impactKind: 'burst' }))).toBe(true);
    expect(isFireShot(shotOf({ impactKind: 'flame', tagName: '炎' }))).toBe(true);
    expect(isFireShot(shotOf({ impactKind: 'nova' }))).toBe(true);
  });

  it('leaves a bolt of another colour, of another look or landing in something else as it was', () => {
    expect(isFireShot(shotOf({ colorSecondary: '#39a7ff' }))).toBe(false);
    expect(isFireShot(shotOf({ colorSecondary: '#ffc24a' }))).toBe(false);
    expect(isFireShot(shotOf({ projectileStyle: 'arrow' }))).toBe(false);
    expect(isFireShot(shotOf({ projectileStyle: 'missile' }))).toBe(false);
    expect(isFireShot(shotOf({ impactKind: 'frost' }))).toBe(false);
    expect(isFireShot(shotOf({ kind: 'burst' }))).toBe(false);
  });

  it('lets the particle a shot carries, and failing that its family, say it is of another element', () => {
    expect(isFireShot(shotOf({ moteStyle: 'frost' }))).toBe(false);
    expect(isFireShot(shotOf({ moteStyle: 'spark', tagName: '氷' }))).toBe(true);
    expect(isFireShot(shotOf({ tagName: '闇' }))).toBe(false);
    expect(isFireShot(shotOf({ tagName: '' }))).toBe(true);
  });

  it('finds the bundled shots of fire and no other bundled effect that is a shot on its own', () => {
    const fire = DEFAULT_EFFECT_PRESET_SEEDS.filter((seed) => {
      const preset = createEffectPreset(seed);
      const burning = !preset.isStaged && isFireShot(preset);
      preset.destroy();
      return burning;
    }).map((seed) => seed.name);

    expect(fire).toEqual(['火の矢', 'ファイアボルト']);
  });
});
