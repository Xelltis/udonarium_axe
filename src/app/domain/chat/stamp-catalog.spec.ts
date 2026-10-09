import { existsSync, readFileSync } from 'node:fs';

import {
  BUILTIN_STAMPS,
  imageStampId,
  isArtStampFamily,
  STAMP_FAMILIES,
  stampArtUrl,
  stampLabelKey,
  stampNameKey,
  stampOf,
  stampsOfFamily,
} from '@axe/domain/chat/stamp-catalog';

function lookUp(dictionary: Record<string, unknown>, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dictionary);
}

describe('the stamps that come with the app', () => {
  it('offers eight of each family it draws and some of each of the character\u2019s, each under an identifier of its own', () => {
    for (const family of STAMP_FAMILIES) {
      if (isArtStampFamily(family)) expect(stampsOfFamily(family).length, family).toBeGreaterThan(0);
      else expect(stampsOfFamily(family), family).toHaveLength(8);
    }
    expect(new Set(BUILTIN_STAMPS.map((each) => each.id)).size).toBe(BUILTIN_STAMPS.length);
  });

  it('has the picture of every one of the character\u2019s stamps among the assets, and none for the ones it draws', () => {
    for (const stamp of BUILTIN_STAMPS) {
      const url = stampArtUrl(stamp);
      if (isArtStampFamily(stamp.family)) {
        expect(url, stamp.id).toBe(`assets/images/stamps/${stamp.family}/${stamp.key}.webp`);
        expect(existsSync(`src/${url}`), stamp.id).toBe(true);
      } else {
        expect(url, stamp.id).toBeNull();
      }
    }
  });

  it.each(['ja', 'en', 'ko'])('names every one in %s, and gives the words to those that write any', (lang) => {
    const dictionary = JSON.parse(readFileSync(`src/assets/i18n/${lang}.json`, 'utf-8'));

    for (const stamp of BUILTIN_STAMPS) {
      expect(lookUp(dictionary, stampNameKey(stamp)), stamp.id).toBeTruthy();
      if (stamp.family === 'sfx' || stamp.family === 'seal') {
        expect(lookUp(dictionary, stampLabelKey(stamp)), stamp.id).toBeTruthy();
      }
    }
    for (const family of ['recent', ...STAMP_FAMILIES]) {
      expect(lookUp(dictionary, `ui.stamp.families.${family}`), family).toBeTruthy();
    }
  });
});

describe('reading a stamp identifier', () => {
  it('knows the stamps that come with the app', () => {
    expect(stampOf('sfx:creepy')).toEqual({ kind: 'builtin', stamp: expect.objectContaining({ key: 'creepy' }) });
  });

  it('names a picture in the room by the picture it is', () => {
    expect(stampOf(imageStampId('abc123'))).toEqual({ kind: 'image', imageIdentifier: 'abc123' });
  });

  it('knows nothing of one this version does not have, nor of an empty one', () => {
    expect(stampOf('sfx:from-a-newer-version')).toBeNull();
    expect(stampOf('')).toBeNull();
    expect(stampOf('  ')).toBeNull();
    expect(stampOf('image:')).toBeNull();
    expect(stampOf(null)).toBeNull();
  });
});
