import { createDefaultEffectPresets } from '@axe/domain/effect/builtin-effect-presets';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { breathElementOf, breathLookOf } from '@axe/domain/effect/scene/breath/breath-looks';

function breathOf(fields: Partial<EffectPreset>): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'breath';
  Object.assign(preset, fields);
  return preset;
}

describe('breathElementOf()', () => {
  it('draws each of the breaths that come with the room as its own element', () => {
    const elements = Object.fromEntries(
      createDefaultEffectPresets()
        .filter((preset) => preset.effectKind === 'breath')
        .map((preset) => [preset.identifier, breathElementOf(preset)])
    );

    expect(elements).toEqual({
      EffectPreset_breath_thunder: 'thunder',
      EffectPreset_breath_wind: 'wind',
      EffectPreset_breath_holy: 'holy',
      EffectPreset_breath_dark: 'dark',
      EffectPreset_breath_fire: 'fire',
      EffectPreset_breath_ice: 'ice',
      EffectPreset_breath_poison: 'poison',
      EffectPreset_breath_earth: 'sand',
    });
  });

  it('takes a breath of the family that heals as the gentle one whatever it carries', () => {
    expect(breathElementOf(breathOf({ tagName: '回復', moteStyle: 'spark' }))).toBe('holy');
  });

  it('takes a breath of the holy family as the gentle one too, whatever it carries', () => {
    expect(breathElementOf(breathOf({ tagName: '聖' }))).toBe('holy');
    expect(breathElementOf(breathOf({ tagName: '聖', moteStyle: 'frost' }))).toBe('holy');
    expect(breathLookOf(breathOf({ tagName: '聖' })).force).toBe(breathLookOf(breathOf({ tagName: '回復' })).force);
  });

  it('goes by what the breath is told to carry before its family', () => {
    expect(breathElementOf(breathOf({ tagName: '炎', moteStyle: 'frost' }))).toBe('ice');
    expect(breathElementOf(breathOf({ tagName: '氷', moteStyle: 'leaf' }))).toBe('wind');
    expect(breathElementOf(breathOf({ tagName: '', moteStyle: 'haze' }))).toBe('dark');
    expect(breathElementOf(breathOf({ tagName: '状態異常', moteStyle: 'haze' }))).toBe('poison');
    expect(breathElementOf(breathOf({ tagName: 'うちの技' }))).toBe('fire');
  });

  it('takes a breath of the family of earth for a torrent of sand, unless it names a particle of its own', () => {
    expect(breathElementOf(breathOf({ tagName: '土' }))).toBe('sand');
    expect(breathElementOf(breathOf({ tagName: ' 土 ' }))).toBe('sand');
    expect(breathElementOf(breathOf({ tagName: '土', moteStyle: 'frost' }))).toBe('ice');
    expect(breathLookOf(breathOf({ tagName: '土' })).buoyancy).toBeLessThan(0);
  });

  it('draws one told to carry nothing by its colour, and has it carry nothing', () => {
    const red = breathOf({ moteStyle: 'none', colorSecondary: '#ff4a1f' });
    const blue = breathOf({ moteStyle: 'none', colorSecondary: '#2f8dff' });

    expect(breathElementOf(red)).toBe('fire');
    expect(breathElementOf(blue)).toBe('ice');
    expect(breathLookOf(red).carried).toBeNull();
    expect(breathLookOf(blue).carries).toBe(false);
    expect(breathLookOf(breathOf({ tagName: '炎' })).carried).not.toBeNull();
  });
});

describe('breathLookOf()', () => {
  it('blows the gentle breath at half the force of a fire, and leaves smoke only for a fire of fire’s colour', () => {
    const holy = breathLookOf(breathOf({ tagName: '回復' }));
    const fire = breathLookOf(breathOf({ tagName: '炎', colorSecondary: '#ff4a1f' }));
    const ghost = breathLookOf(breathOf({ tagName: '炎', colorSecondary: '#2f8dff' }));

    expect(holy.force).toBeCloseTo(fire.force / 2);
    expect(fire.fiery).toBe(true);
    expect(ghost.fiery).toBe(false);
  });

  it('throws no light for a wind or a darkness', () => {
    expect(breathLookOf(breathOf({ tagName: '風' })).light).toBe(0);
    expect(breathLookOf(breathOf({ tagName: '闇' })).light).toBe(0);
    expect(breathLookOf(breathOf({ tagName: '雷' })).light).toBeGreaterThan(0);
  });
});
