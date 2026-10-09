import { TestBed } from '@angular/core/testing';
import { stampWords } from '@axe/application/chat/stamp-words';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('the words that stand in for a stamp', () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    key === 'ui.stamp.standIn' ? `［${params?.['words']}］` : `<${key}>`;

  it('are the words written on a sound effect or a seal, and the name of a table mark', () => {
    expect(stampWords('sfx:creepy', t)).toBe('［<ui.stamp.items.sfx.creepy.label>］');
    expect(stampWords('seal:ok', t)).toBe('［<ui.stamp.items.seal.ok.label>］');
    expect(stampWords('motif:skull', t)).toBe('［<ui.stamp.items.motif.skull.name>］');
  });

  it('name a picture from the room by its file, or call it a stamp where it is not here', () => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    expect(stampWords('image:not-here', t)).toBe('［<ui.stamp.picture>］');

    ImageStorage.instance.add({
      identifier: 'stamp-picture',
      name: 'ナイス.png',
      type: 'image/png',
      blob: null,
      url: 'blob:stamp-picture',
      thumbnail: { type: '', blob: null, url: '' },
    });
    try {
      expect(stampWords('image:stamp-picture', t)).toBe('［ナイス］');
    } finally {
      ImageStorage.instance.delete('stamp-picture');
    }
  });

  it('are nothing for a stamp this version does not know', () => {
    expect(stampWords('sfx:from-a-newer-version', t)).toBe('');
  });

  it('read well in the language the app is in', () => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const translate = TestBed.inject(TRANSLATE_FN);

    expect(stampWords('seal:ok', translate)).toBe(
      translate('ui.stamp.standIn', { words: translate('ui.stamp.items.seal.ok.label') })
    );
  });
});
