import {
  createZipBlob,
  createZipBlobOnMainThread,
  readZipEntries,
  useFflateLoader,
  useZipWorkerFactory,
  ZipCodeUnavailableError,
} from '@axe/core/storage/zip-archive';
import { strToU8, unzipSync } from 'fflate';

async function unzipBlob(blob: Blob): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

describe('createZipBlob()', () => {
  it('packs on the main thread where no worker is available', async () => {
    const files = [
      new File([strToU8('<room />')], 'data.xml', { type: 'text/plain' }),
      new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' }),
    ];

    const blob = await createZipBlob(files);

    expect(blob.type).toBe('application/zip');
    const entries = await unzipBlob(blob);
    expect(Object.keys(entries).sort()).toEqual(['data.xml', 'image.png']);
    expect(new TextDecoder().decode(entries['data.xml'])).toBe('<room />');
    expect([...entries['image.png']]).toEqual([137, 80, 78, 71]);
  });

  it('carries an already-compressed image through unharmed', async () => {
    const payload = new Uint8Array(1024).map((_, index) => index % 251);
    const files = [new File([payload], 'photo.jpg', { type: 'image/jpeg' })];

    const entries = await unzipBlob(await createZipBlobOnMainThread(files));

    expect([...entries['photo.jpg']]).toEqual([...payload]);
  });

  it('returns an empty archive for no files', async () => {
    const blob = await createZipBlob([]);

    expect(await unzipBlob(blob)).toEqual({});
  });
});

describe('readZipEntries()', () => {
  it('unpacks an archive into bytes and their types', async () => {
    const blob = await createZipBlob([
      new File([strToU8('<room />')], 'data.xml', { type: 'text/plain' }),
      new File([new Uint8Array([1, 2, 3])], 'picture.webp', { type: 'image/webp' }),
    ]);

    const entries = await readZipEntries(blob);

    const byName = new Map(entries.map((entry) => [entry.name, entry]));
    expect([...byName.keys()].sort()).toEqual(['data.xml', 'picture.webp']);
    expect(byName.get('picture.webp')?.type).toBe('image/webp');
    expect(await byName.get('data.xml')?.blob.text()).toBe('<room />');
    expect([...new Uint8Array(await byName.get('picture.webp')!.blob.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it('fails on a broken archive', async () => {
    await expect(readZipEntries(new Blob([new Uint8Array([0, 1, 2, 3])]))).rejects.toBeDefined();
  });
});

describe('without the code for zips', () => {
  afterEach(() => useFflateLoader(null));

  it('says the code could not be fetched, packing or unpacking, so a reload can be offered', async () => {
    const missing = new TypeError('Failed to fetch dynamically imported module');
    useFflateLoader(() => Promise.reject(missing));
    const files = [new File([strToU8('<room />')], 'data.xml', { type: 'text/plain' })];

    const packing = createZipBlob(files);
    await expect(packing).rejects.toBeInstanceOf(ZipCodeUnavailableError);
    await expect(packing).rejects.toMatchObject({ cause: missing });
    await expect(readZipEntries(new Blob([new Uint8Array([1])]))).rejects.toBeInstanceOf(ZipCodeUnavailableError);
  });

  it('leaves a broken archive a broken archive', async () => {
    const reading = readZipEntries(new Blob([new Uint8Array([0, 1, 2, 3])]));

    await expect(reading).rejects.toBeDefined();
    await expect(reading).rejects.not.toBeInstanceOf(ZipCodeUnavailableError);
  });
});

describe('the shared worker', () => {
  afterEach(() => {
    useZipWorkerFactory(null);
  });

  it('lets go of every waiting request when another worker takes over', async () => {
    class SilentWorker {
      addEventListener(): void {}
      terminate(): void {}
      postMessage(): void {}
    }
    useZipWorkerFactory(() => new SilentWorker() as unknown as Worker);
    const files = [new File([strToU8('<room />')], 'data.xml', { type: 'text/plain' })];

    const waiting = createZipBlob(files);
    useZipWorkerFactory(null);

    expect((await waiting).type).toBe('application/zip');
  });

  it('lets go of every waiting request when the work cannot be handed over', async () => {
    let posts = 0;
    class FakeWorker {
      addEventListener(): void {}
      terminate(): void {}
      postMessage(): void {
        posts += 1;
        if (posts > 1) throw new Error('cannot be cloned');
      }
    }
    useZipWorkerFactory(() => new FakeWorker() as unknown as Worker);
    const files = [new File([strToU8('<room />')], 'data.xml', { type: 'text/plain' })];

    // The first went to the worker and is waiting; the second cannot be handed over, which
    // stops the worker the first was waiting on.
    const first = createZipBlob(files);
    const second = createZipBlob(files);

    const [a, b] = await Promise.all([first, second]);

    expect(posts).toBe(2);
    expect(a.type).toBe('application/zip');
    expect(b.type).toBe('application/zip');
  });
});
