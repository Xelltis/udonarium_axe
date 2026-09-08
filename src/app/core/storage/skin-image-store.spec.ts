import { SkinImageStore } from '@axe/core/storage/skin-image-store';

describe('where a skin keeps its pictures', () => {
  const store = SkinImageStore.instance;

  afterEach(() => {
    vi.restoreAllMocks();
    store.reset();
  });

  it('is one store, however many ask for it', () => {
    expect(SkinImageStore.instance).toBe(store);
  });

  it('says so where the browser has nowhere to put them', async () => {
    vi.spyOn(store, 'isAvailable').mockReturnValue(false);

    expect(await store.get('light')).toBeNull();
    expect(await store.put('light', new Blob(['a']))).toBe(false);
    await expect(store.remove('light')).resolves.toBeUndefined();
  });
});
