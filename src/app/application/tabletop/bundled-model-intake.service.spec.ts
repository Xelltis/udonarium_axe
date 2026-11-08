import { TestBed } from '@angular/core/testing';
import { BundledModelIntakeService } from '@axe/application/tabletop/bundled-model-intake.service';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BundledModelIntakeService', () => {
  let service: BundledModelIntakeService;
  let storage: ModelStorage;
  let fetched: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(BundledModelIntakeService);
    storage = TestBed.inject(ModelStorage);
    fetched = vi.fn(async () => new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 }));
    vi.stubGlobal('fetch', fetched);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('answers a model held in the room by its own identifier, fetching nothing', async () => {
    expect(await service.identifierOf('a1b2c3')).toBe('a1b2c3');
    expect(fetched).not.toHaveBeenCalled();
  });

  it('reads a bundled model into the room once, and answers the identifier it is held under', async () => {
    const add = vi.spyOn(storage, 'addAsync').mockResolvedValue({ identifier: 'held-oak' } as never);
    vi.spyOn(storage, 'get').mockReturnValue({ identifier: 'held-oak' } as never);

    const first = await service.identifierOf('tree_oak');
    const again = await service.identifiersOf(['tree_oak', 'tree_oak']);

    expect(first).toBe('held-oak');
    expect([...again]).toEqual([['tree_oak', 'held-oak']]);
    expect(fetched).toHaveBeenCalledTimes(1);
    expect(fetched.mock.calls[0][0]).toBe('assets/models/nature/tree_oak.glb');
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('asks again for a model that could not be read, and for one the room no longer holds', async () => {
    fetched.mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.spyOn(storage, 'addAsync').mockResolvedValue({ identifier: 'held-oak' } as never);
    const held = vi.spyOn(storage, 'get').mockReturnValue(null);

    expect(await service.identifierOf('tree_oak')).toBe('');
    expect(await service.identifierOf('tree_oak')).toBe('held-oak');
    expect(await service.identifierOf('tree_oak')).toBe('held-oak');
    expect(fetched).toHaveBeenCalledTimes(3);

    held.mockReturnValue({ identifier: 'held-oak' } as never);
    expect(await service.identifierOf('tree_oak')).toBe('held-oak');
    expect(fetched).toHaveBeenCalledTimes(3);
  });

  it('reads a model that could not be read again once for all who were waiting on it', async () => {
    fetched.mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.spyOn(storage, 'addAsync').mockResolvedValue({ identifier: 'held-oak' } as never);
    vi.spyOn(storage, 'get').mockReturnValue(null);

    const first = service.identifierOf('tree_oak');
    const waiting = [1, 2, 3].map(() => service.identifierOf('tree_oak'));

    expect(await first).toBe('');
    expect(await Promise.all(waiting)).toEqual(['held-oak', 'held-oak', 'held-oak']);
    expect(fetched).toHaveBeenCalledTimes(2);
  });
});
