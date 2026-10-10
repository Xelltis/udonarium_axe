import { DiceImageStore } from '@axe/core/storage/dice-image-store';
import { SkinImageStore } from '@axe/core/storage/skin-image-store';

describe('where the picture for this seat’s dice is kept', () => {
  const store = DiceImageStore.instance;

  afterEach(() => {
    vi.restoreAllMocks();
    store.reset();
  });

  it('is one store, however many ask for it, and not the skin’s', () => {
    expect(DiceImageStore.instance).toBe(store);
    expect(store).not.toBe(SkinImageStore.instance as unknown);
  });

  it('says so where the browser has nowhere to put it', async () => {
    vi.spyOn(store, 'isAvailable').mockReturnValue(false);

    expect(await store.get('a'.repeat(64))).toBeNull();
    expect(await store.put('a'.repeat(64), new Blob(['a']))).toBe(false);
    await expect(store.remove('a'.repeat(64))).resolves.toBeUndefined();
  });
});
