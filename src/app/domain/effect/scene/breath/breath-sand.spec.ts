import { ObjectStore } from '@axe/core/sync/object-store';
import { hexChannels } from '@axe/core/util/hex-color';
import { createEffectPreset, DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { type EffectCast } from '@axe/domain/effect/effect-cast';
import { jetSheetsOf } from '@axe/domain/effect/scene/breath/breath-jet';
import { nothingStaged } from '@axe/domain/effect/scene/choreography';
import { stageEffect } from '@axe/domain/effect/scene/effect-frame';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';

const CELL = 50;

function lightness(color: string): number {
  const [red, green, blue] = hexChannels(color)!;
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

describe('a breath of sand', () => {
  it('lays its jet in ochre and umber, none of it as pale as its light colour, so it holds over a bright table', () => {
    const seed = DEFAULT_EFFECT_PRESET_SEEDS.find((each) => each.identifier === 'EffectPreset_breath_earth')!;
    const ramp = rampOf(seed.colorPrimary, seed.colorSecondary, 7);
    const sheets = jetSheetsOf('sand', ramp);

    for (const sheet of sheets) {
      expect(lightness(sheet.color)).toBeLessThan(lightness(ramp[3]));
      if (sheet.core) expect(lightness(sheet.core)).toBeLessThan(lightness(ramp[3]));
    }
    expect(Math.min(...sheets.map((sheet) => lightness(sheet.color)))).toBeLessThan(0.2);
  });

  it('carries stones in its torrent, dark ones as large as a fifth of a cell', () => {
    const preset = createEffectPreset(
      DEFAULT_EFFECT_PRESET_SEEDS.find((each) => each.identifier === 'EffectPreset_breath_earth')!
    );
    const cast: EffectCast = {
      presetIdentifier: preset.identifier,
      casterIdentifier: 'caster',
      origin: { x: 0, y: 300, z: 30 },
      targets: [{ identifier: 't0', x: 400, y: 300, z: 0 }],
      seed: 9,
    };
    try {
      const drawn = nothingStaged();
      stageEffect(preset, cast, preset.duration * 0.5, { cellPx: CELL }, drawn);
      const stones = drawn.motes.filter(
        (mote) => mote.shape === 'chunk' && mote.blend === 'color' && lightness(mote.color) < 0.45
      );

      expect(stones.length).toBeGreaterThan(10);
      expect(Math.max(...stones.map((stone) => stone.size))).toBeGreaterThan(CELL * 0.2);
    } finally {
      ObjectStore.instance.remove(preset);
    }
  });
});
