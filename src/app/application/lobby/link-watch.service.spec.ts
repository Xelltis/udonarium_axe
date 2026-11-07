import { TestBed } from '@angular/core/testing';
import { LinkWatchService, SEEN_ASK_INTERVAL_MS } from '@axe/application/lobby/link-watch.service';
import { Network } from '@axe/core/network/network';

describe('LinkWatchService', () => {
  let service: LinkWatchService;
  let watched: boolean[];
  let asks: number;

  beforeEach(() => {
    vi.useFakeTimers();
    watched = [];
    asks = 0;
    vi.spyOn(Network, 'watchLink').mockImplementation((closely) => void watched.push(closely));
    vi.spyOn(Network, 'askSeen').mockImplementation(() => void asks++);
    service = TestBed.inject(LinkWatchService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('asks at once and every while for as long as anybody watches, and stops once the last lets go', () => {
    const panel = service.watch();
    const widget = service.watch();
    expect(asks).toBe(1);
    expect(watched).toEqual([true]);

    vi.advanceTimersByTime(SEEN_ASK_INTERVAL_MS);
    expect(asks).toBe(2);
    expect(service.asked()).toBe(2);

    panel();
    panel();
    vi.advanceTimersByTime(SEEN_ASK_INTERVAL_MS);
    expect(asks).toBe(3);
    expect(watched).toEqual([true, true, true]);

    widget();
    vi.advanceTimersByTime(SEEN_ASK_INTERVAL_MS * 3);
    expect(asks).toBe(3);
    expect(watched.at(-1)).toBe(false);
  });

  it('starts asking again for whoever watches after everybody let go', () => {
    service.watch()();
    service.watch();

    expect(asks).toBe(2);
    expect(watched).toEqual([true, false, true]);
  });
});
