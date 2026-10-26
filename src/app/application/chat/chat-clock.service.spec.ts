import { TestBed } from '@angular/core/testing';
import { ChatClockService } from '@axe/application/chat/chat-clock.service';
import { Network } from '@axe/core/network/network';

describe('ChatClockService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets the chat clock by a room server’s, asking no time server', () => {
    const clock = TestBed.inject(ChatClockService);
    vi.spyOn(Network.instance, 'serverClockOffset', 'get').mockReturnValue(60_000);
    const fetch = vi.spyOn(globalThis, 'fetch');

    clock.calibrate();

    expect(fetch).not.toHaveBeenCalled();
    expect(Math.abs(clock.now() - (Date.now() + 60_000))).toBeLessThan(1_000);
  });
});
