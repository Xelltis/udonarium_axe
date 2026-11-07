import { TestBed } from '@angular/core/testing';
import { LinkWatchService, LOOKED_AT_MS, SEEN_ASK_INTERVAL_MS } from '@axe/application/lobby/link-watch.service';
import { Network } from '@axe/core/network/network';
import { pageActivity } from '@axe/core/network/server/page-activity';

describe('LinkWatchService', () => {
  let service: LinkWatchService;
  let watched: boolean[];
  let asks: number;
  let authority: string | null;

  beforeEach(() => {
    vi.useFakeTimers();
    watched = [];
    asks = 0;
    authority = '@authority';
    vi.spyOn(Network, 'authorityPeerId', 'get').mockImplementation(() => authority);
    vi.spyOn(Network, 'watchLink').mockImplementation((closely) => void watched.push(closely));
    vi.spyOn(Network, 'askSeen').mockImplementation(() => void asks++);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    pageActivity.noteInput();
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

  it('asks nothing while nobody has used the page for a while, and asks again once somebody does', () => {
    service.watch();
    vi.advanceTimersByTime(LOOKED_AT_MS);
    const before = asks;
    vi.advanceTimersByTime(SEEN_ASK_INTERVAL_MS * 3);
    expect(asks).toBe(before);
    expect(watched.at(-1)).toBe(false);

    pageActivity.noteInput();
    vi.advanceTimersByTime(SEEN_ASK_INTERVAL_MS);
    expect(asks).toBe(before + 1);
    expect(watched.at(-1)).toBe(true);
  });

  it('asks nothing while the page is hidden', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    service.watch();

    expect(asks).toBe(0);
    expect(watched).toEqual([false]);
  });

  it('asks nothing outside a room on a room server, and moves nothing on', () => {
    authority = null;

    service.watch();
    vi.advanceTimersByTime(SEEN_ASK_INTERVAL_MS);

    expect(asks).toBe(0);
    expect(watched).toEqual([]);
    expect(service.asked()).toBe(0);
  });
});
