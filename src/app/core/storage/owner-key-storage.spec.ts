import { loadOrCreateOwnerKey } from '@axe/core/storage/owner-key-storage';

describe('loadOrCreateOwnerKey', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem('udonarium-axe.owner-key');
  });

  it('makes a key of its own the first time, and hands the same one back after', () => {
    const made = loadOrCreateOwnerKey();

    expect(made).toMatch(/^owner_[0-9a-f-]{36}$/);
    expect(loadOrCreateOwnerKey()).toBe(made);
    expect(localStorage.getItem('udonarium-axe.owner-key')).toBe(made);
  });

  it('answers nothing where the browser keeps nothing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });

    expect(loadOrCreateOwnerKey()).toBeNull();
  });
});
