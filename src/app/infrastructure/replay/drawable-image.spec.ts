import { type DrawableImageSource, loadDrawableImages } from '@axe/infrastructure/replay/drawable-image';

/** A stand-in for the bitmap a blob decodes to, told apart by the blob's size. */
function decoded(blob: Blob): { width: number; height: number } {
  return { width: blob.size, height: blob.size };
}

describe('loadDrawableImages()', () => {
  const bad = new Blob(['!']);

  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', (blob: Blob) =>
      blob === bad ? Promise.reject(new Error('undecodable')) : Promise.resolve(decoded(blob))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads each picture once, however many times it is asked for, and asks for no empty name', async () => {
    const get = vi.fn((identifier: string) => ({ blob: new Blob([identifier.repeat(2)]), url: '' }));
    const storage: DrawableImageSource = { get };

    const loaded = await loadDrawableImages(storage, ['a', 'b', 'a', '', 'b']);

    expect(get.mock.calls.map(([identifier]) => identifier)).toEqual(['a', 'b']);
    expect([...loaded.keys()]).toEqual(['a', 'b']);
    expect(loaded.get('a')).toMatchObject({ width: 2 });
  });

  it('tells of a picture the storage no longer holds and leaves it out', async () => {
    const storage: DrawableImageSource = {
      get: (identifier) => (identifier === 'kept' ? { blob: new Blob(['kept']), url: '' } : null),
    };
    const missing = vi.fn();

    const loaded = await loadDrawableImages(storage, ['kept', 'gone'], missing);

    expect([...loaded.keys()]).toEqual(['kept']);
    expect(missing).toHaveBeenCalledTimes(1);
    expect(missing).toHaveBeenCalledWith('gone');
  });

  it('tells why a picture could not be decoded and leaves it out, loading the rest', async () => {
    const storage: DrawableImageSource = {
      get: (identifier) => ({ blob: identifier === 'broken' ? bad : new Blob(['fine']), url: '' }),
    };
    const missing = vi.fn();

    const loaded = await loadDrawableImages(storage, ['broken', 'fine'], missing);

    expect([...loaded.keys()]).toEqual(['fine']);
    expect(missing).toHaveBeenCalledWith('broken', expect.any(Error));
  });
});
