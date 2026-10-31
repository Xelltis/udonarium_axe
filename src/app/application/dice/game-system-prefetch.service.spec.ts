import { TestBed } from '@angular/core/testing';
import { GAME_SYSTEM_RETRY_MS, GameSystemPrefetchService } from '@axe/application/dice/game-system-prefetch.service';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import type GameSystemClass from 'bcdice/lib/game_system';

describe('GameSystemPrefetchService', () => {
  const standIn = { ID: 'Far' } as unknown as GameSystemClass;
  const real = { ID: 'Far' } as unknown as GameSystemClass;
  let now: number;
  let load: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.spyOn(DiceBot, 'loadedGameSystem').mockReturnValue(null);
    vi.spyOn(DiceBot, 'isUnreachable').mockImplementation((system) => system === standIn);
    load = vi.spyOn(DiceBot, 'loadGameSystemAsync').mockResolvedValue(standIn);
  });

  afterEach(() => vi.restoreAllMocks());

  async function settled(): Promise<void> {
    for (let index = 0; index < 5; index++) await Promise.resolve();
  }

  it('asks for a system once while its fetch is under way, however often it is looked at', () => {
    const systems = TestBed.inject(GameSystemPrefetchService);

    for (let key = 0; key < 20; key++) expect(systems.systemFor('Far')).toBeNull();

    expect(load).toHaveBeenCalledOnce();
  });

  it('answers the stand-in after a fetch that failed, and asks again only once a while has passed', async () => {
    const systems = TestBed.inject(GameSystemPrefetchService);
    systems.systemFor('Far');
    await settled();

    expect(systems.systemFor('Far')).toBe(standIn);
    expect(load).toHaveBeenCalledOnce();

    load.mockResolvedValue(real);
    now += GAME_SYSTEM_RETRY_MS;
    systems.systemFor('Far');
    await settled();

    expect(load).toHaveBeenCalledTimes(2);
    expect(systems.systemFor('Far')).toBe(real);
  });

  it('counts each fetch as it comes back', async () => {
    const systems = TestBed.inject(GameSystemPrefetchService);
    const before = systems.arrivals();

    systems.systemFor('Far');
    await settled();

    expect(systems.arrivals()).toBe(before + 1);
  });
});
