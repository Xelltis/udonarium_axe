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

    expect(service.isJoined('blob:wall')).toBe(false);
    expect(service.isJoined('blob:crop')).toBe(false);
    await vi.waitFor(() => expect(service.isJoined('blob:wall')).toBe(true));
    expect(service.isJoined('blob:crop')).toBe(false);
    service.isJoined('blob:wall');
    expect(fetching).toHaveBeenCalledTimes(2);
  });

  it('reads nothing that is not held here, and takes what cannot be read for no joined wall', async () => {
    const fetching = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('gone'));

    expect(service.isJoined('https://example.com/wall.glb')).toBe(false);
    expect(service.isJoined('blob:lost')).toBe(false);
    await vi.waitFor(() => expect(fetching).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(service.isJoined('blob:lost')).toBe(false);
    expect(fetching).toHaveBeenCalledTimes(1);
  });
});
