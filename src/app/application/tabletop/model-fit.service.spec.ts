import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModelFitService } from '@axe/application/tabletop/model-fit.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** A binary glTF file of a JSON chunk alone, its scene's extras as given. */
function glb(extras: unknown): ArrayBuffer {
  const text = new TextEncoder().encode(JSON.stringify({ scenes: [{ nodes: [], extras }], scene: 0 }));
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
  padded.set(text);
  const bytes = new Uint8Array(20 + padded.length);
  const view = new DataView(bytes.buffer);
  bytes.set([0x67, 0x6c, 0x54, 0x46], 0);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, padded.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(padded, 20);
  return bytes.buffer;
}

describe('ModelFitService', () => {
  let service: ModelFitService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(ModelFitService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('reads once whether a model held here is made as a joined wall, and says so once it is read', async () => {
    const fetching = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      return new Response(glb(url.endsWith('wall') ? { fit: 'joined' } : { fit: 'tile' }));
    });
    const read = vi.fn();
    service.onRead(read);

    expect(service.isJoined('blob:wall')).toBe(false);
    expect(service.isJoined('blob:crop')).toBe(false);
    expect(service.isReading).toBe(true);
    await vi.waitFor(() => expect(service.isJoined('blob:wall')).toBe(true));
    await vi.waitFor(() => expect(service.isReading).toBe(false));
    expect(service.isJoined('blob:crop')).toBe(false);
    service.isJoined('blob:wall');
    expect(fetching).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('asks again whoever asked while it read only once a model turns out to be a joined wall', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input) => new Response(glb(String(input).endsWith('wall') ? { fit: 'joined' } : {}))
    );
    let asked = 0;
    const crop = computed(() => {
      asked++;
      return service.isJoined('blob:crop');
    });
    const wall = computed(() => service.isJoined('blob:wall'));

    expect(crop()).toBe(false);
    expect(wall()).toBe(false);
    await vi.waitFor(() => expect(wall()).toBe(true));
    expect(crop()).toBe(false);
    expect(asked).toBe(2);
  });

  it('reads nothing that is not held here, and takes what cannot be read for no joined wall, writing nothing as it is asked', async () => {
    const fetching = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('gone');
    });
    const asked = computed(() => service.isJoined('blob:lost'));

    expect(service.isJoined('https://example.com/wall.glb')).toBe(false);
    expect(() => asked()).not.toThrow();
    await vi.waitFor(() => expect(service.isReading).toBe(false));
    expect(service.isJoined('blob:lost')).toBe(false);
    expect(fetching).toHaveBeenCalledTimes(1);
  });
});
