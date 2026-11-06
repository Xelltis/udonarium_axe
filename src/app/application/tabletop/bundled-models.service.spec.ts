import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TestBed } from '@angular/core/testing';
import { BUNDLED_MODEL_RETRY_MS, BundledModelsService } from '@axe/application/tabletop/bundled-models.service';
import { BUNDLED_PIECE_MODELS } from '@axe/core/storage/bundled-models';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GOBLIN = BUNDLED_PIECE_MODELS.goblin;
const goblinBytes = () => readFileSync(join(process.cwd(), 'src/assets/models/pieces/goblin.glb'));

describe('BundledModelsService', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] }));

  afterEach(() => {
    ModelStorage.instance.delete(GOBLIN);
    vi.restoreAllMocks();
  });

  it('reads a bundled model from beside the page once, and holds it as the identifier names it', async () => {
    const fetched = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(goblinBytes()));
    const bundled = TestBed.inject(BundledModelsService);

    bundled.read(GOBLIN);
    bundled.read(GOBLIN);
    await vi.waitFor(() => expect(ModelStorage.instance.get(GOBLIN)?.isReady).toBe(true));

    expect(fetched).toHaveBeenCalledTimes(1);
    expect(String(fetched.mock.calls[0][0])).toBe('assets/models/pieces/goblin.glb');
    expect(ModelStorage.instance.get(GOBLIN)?.name).toBe('goblin.glb');
  });

  it('takes in no bytes that are not what the identifier names, and reads no model that is not bundled', async () => {
    const fetched = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(new Uint8Array([1, 2, 3])));
    const bundled = TestBed.inject(BundledModelsService);

    bundled.read('0'.repeat(64));
    bundled.read(GOBLIN);
    await vi.waitFor(() => expect(fetched).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ModelStorage.instance.get(GOBLIN)).toBeNull();
  });

  it('asks again for a model that could not be read, once a while has passed, and not before', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const fetched = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => new Response('', { status: 404 }))
      .mockImplementation(async () => new Response(goblinBytes()));
    const bundled = TestBed.inject(BundledModelsService);

    bundled.read(GOBLIN);
    await vi.waitFor(() => expect(fetched).toHaveBeenCalledTimes(1));
    now += 1000;
    bundled.read(GOBLIN);
    expect(fetched).toHaveBeenCalledTimes(1);

    now += BUNDLED_MODEL_RETRY_MS;
    bundled.read(GOBLIN);
    await vi.waitFor(() => expect(ModelStorage.instance.get(GOBLIN)?.isReady).toBe(true));
    expect(fetched).toHaveBeenCalledTimes(2);
  });

  it('tells a bundled model still to come, until it is held, or could not be read, and calls back as it is read', async () => {
    let answer: (response: Response) => void = () => undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));
    const bundled = TestBed.inject(BundledModelsService);
    const read = vi.fn();
    bundled.onRead(read);

    expect(bundled.isComing(GOBLIN)).toBe(true);
    expect(bundled.isComing('0'.repeat(64))).toBe(false);
    bundled.read(GOBLIN);
    expect(bundled.isComing(GOBLIN)).toBe(true);
    answer(new Response('', { status: 404 }));
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(bundled.isComing(GOBLIN)).toBe(false);
  });

  it('tells a bundled model no longer to come once it is held', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(goblinBytes()));
    const bundled = TestBed.inject(BundledModelsService);

    bundled.read(GOBLIN);
    await vi.waitFor(() => expect(ModelStorage.instance.get(GOBLIN)?.isReady).toBe(true));
    expect(bundled.isComing(GOBLIN)).toBe(false);
  });
});
