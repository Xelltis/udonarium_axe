import { browserLocalStorage, readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { refuseLocalStorage, refuseLocalStorageOutright } from '@axe/testing/refused-storage';

describe('what this browser keeps', () => {
  const KEY = 'local-preference-spec';

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(KEY);
  });

  it('reads back what was written, and nothing once it is taken away', () => {
    expect(writeLocal(KEY, 'kept')).toBe(true);
    expect(readLocal(KEY)).toBe('kept');

    expect(writeLocal(KEY, null)).toBe(true);
    expect(readLocal(KEY)).toBeNull();
  });

  it('reads nothing from a browser that refuses to say', () => {
    localStorage.setItem(KEY, 'kept');
    refuseLocalStorage();

    expect(readLocal(KEY)).toBeNull();
  });

  it('answers that nothing was written to a browser that refuses', () => {
    refuseLocalStorage();

    expect(writeLocal(KEY, 'kept')).toBe(false);
  });

  it('hands over no storage, and reads and writes nothing, where the browser refuses it outright', () => {
    refuseLocalStorageOutright();

    expect(browserLocalStorage()).toBeNull();
    expect(readLocal(KEY)).toBeNull();
    expect(writeLocal(KEY, 'kept')).toBe(false);
  });

  it('hands over no storage where the browser has none', () => {
    vi.stubGlobal('localStorage', undefined);

    expect(browserLocalStorage()).toBeNull();

    vi.unstubAllGlobals();
  });
});
