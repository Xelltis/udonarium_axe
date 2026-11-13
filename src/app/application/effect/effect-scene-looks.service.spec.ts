import { TestBed } from '@angular/core/testing';
import {
  EFFECT_LOOKS_IMPORT,
  EFFECT_LOOKS_RETRY_MS,
  type EffectSceneLooks,
  EffectSceneLooksService,
} from '@axe/application/effect/effect-scene-looks.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('EffectSceneLooksService', () => {
  const looks = {} as EffectSceneLooks;
  let fetches: number;
  let fails: boolean;

  beforeEach(() => {
    fetches = 0;
    fails = true;
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: EFFECT_LOOKS_IMPORT,
          useValue: () => {
            fetches += 1;
            return fails ? Promise.reject(new Error('offline')) : Promise.resolve(looks);
          },
        },
      ],
    });
  });

  afterEach(() => vi.useRealTimers());

  it('asks for the looks again a while after loading them failed, and not on every draw meanwhile', async () => {
    const service = TestBed.inject(EffectSceneLooksService);

    expect(service.looks()).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1);

    service.looks();
    await vi.advanceTimersByTimeAsync(EFFECT_LOOKS_RETRY_MS - 1);
    service.looks();
    expect(fetches).toBe(1);

    fails = false;
    await vi.advanceTimersByTimeAsync(1);
    service.looks();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetches).toBe(2);
    expect(service.looks()).toBe(looks);
  });
});
