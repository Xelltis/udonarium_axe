import { readFileSync } from 'node:fs';

import { CUT_IN_FONT_PRESETS } from '@axe/domain/media/cut-in-font-presets';

describe('the kinds of lettering a cut-in offers', () => {
  it('ends every list of fonts in a generic family, for a screen that has none of them', () => {
    for (const preset of CUT_IN_FONT_PRESETS.filter((each) => each.fontFamily.length > 0)) {
      expect(preset.fontFamily, preset.id).toMatch(/(sans-serif|serif|monospace)$/);
    }
  });

  it('starts with the default, which writes no font at all', () => {
    expect(CUT_IN_FONT_PRESETS[0]).toEqual({ id: 'default', fontFamily: '' });
  });

  it.each(['ja', 'en', 'ko'])('names every one in %s', (lang) => {
    const dictionary = JSON.parse(readFileSync(`src/assets/i18n/${lang}.json`, 'utf-8'));
    const names = dictionary.feature.media.cutInEditor.fontPresets as Record<string, string>;

    for (const preset of CUT_IN_FONT_PRESETS) expect(names[preset.id], preset.id).toBeTruthy();
  });
});
