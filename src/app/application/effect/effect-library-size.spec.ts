import {
  EFFECT_LIBRARY_MIN_SIZE,
  EFFECT_LIBRARY_SIZE,
  readEffectLibrarySize,
  writeEffectLibrarySize,
} from '@axe/application/effect/effect-library-size';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';

/** A storage of its own, so nothing is left in the one the specs share. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const kept = new Map(Object.entries(initial));
  return {
    get length() {
      return kept.size;
    },
    key: (index: number) => [...kept.keys()][index] ?? null,
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
    clear: () => kept.clear(),
  };
}

function refusingStorage(): Storage {
  const refuse = () => {
    throw new DOMException('blocked', 'SecurityError');
  };
  return { length: 0, key: refuse, getItem: refuse, setItem: refuse, removeItem: refuse, clear: refuse };
}

describe('the size the list of effects opens at', () => {
  it('is 540 by 720 the first time, and may be made no smaller than 340 by 420', () => {
    expect(EFFECT_LIBRARY_SIZE).toEqual({ width: 540, height: 720 });
    expect(EFFECT_LIBRARY_MIN_SIZE).toEqual({ width: 340, height: 420 });
    expect(readEffectLibrarySize(memoryStorage())).toEqual(EFFECT_LIBRARY_SIZE);
  });

  it('is the size the reader left it at the next time', () => {
    const storage = memoryStorage();

    expect(writeEffectLibrarySize(storage, { width: 812.4, height: 655.6 })).toBe(true);

    expect(readEffectLibrarySize(storage)).toEqual({ width: 812, height: 656 });
  });

  it('goes back to the first-time size for what is broken, of another form or smaller than the panel may be', () => {
    for (const raw of [
      'not json',
      '[]',
      'null',
      '"540x720"',
      '{"width":"540","height":720}',
      '{"width":540}',
      '{"width":339,"height":720}',
      '{"width":540,"height":419}',
      '{"width":1e9,"height":720}',
      '{"width":null,"height":null}',
    ]) {
      const storage = memoryStorage({ [STORAGE_KEYS.effectLibrarySize]: raw });
      expect(readEffectLibrarySize(storage), raw).toEqual(EFFECT_LIBRARY_SIZE);
    }
  });

  it('keeps no size smaller than the panel may be made, and leaves the one kept before as it was', () => {
    const storage = memoryStorage();
    writeEffectLibrarySize(storage, { width: 600, height: 700 });

    expect(writeEffectLibrarySize(storage, { width: 200, height: 700 })).toBe(false);
    expect(writeEffectLibrarySize(storage, { width: 600, height: Number.NaN })).toBe(false);

    expect(readEffectLibrarySize(storage)).toEqual({ width: 600, height: 700 });
  });

  it('opens at the first-time size and keeps nothing where the browser has no storage or refuses it', () => {
    expect(readEffectLibrarySize(null)).toEqual(EFFECT_LIBRARY_SIZE);
    expect(writeEffectLibrarySize(null, { width: 600, height: 700 })).toBe(false);
    expect(readEffectLibrarySize(refusingStorage())).toEqual(EFFECT_LIBRARY_SIZE);
    expect(writeEffectLibrarySize(refusingStorage(), { width: 600, height: 700 })).toBe(false);
  });
});
