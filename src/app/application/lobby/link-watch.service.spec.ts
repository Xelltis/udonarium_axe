import { TestBed } from '@angular/core/testing';
import { LinkWatchService, LOOKED_AT_MS, SEEN_ASK_INTERVAL_MS } from '@axe/application/lobby/link-watch.service';
import { Network } from '@axe/core/network/network';
import { pageActivity } from '@axe/core/network/server/page-activity';

describe('LinkWatchService', () => {
  let service: LinkWatchService;
  let watched: boolean[];
  let asks: number;
  let authority: string | null;
  let visibility: DocumentVisibilityState;
  let released: (() => void)[];

  const watch = (): (() => void) => {
    const release = service.watch();
    released.push(release);
    return release;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    watched = [];
    asks = 0;
    authority = '@authority';
    visibility = 'visible';
    released = [];
    vi.spyOn(Network, 'authorityPeerId', 'get').mockImplementation(() => authority);
    vi.spyOn(Network, 'watchLink').mockImplementation((closely) => void watched.push(closely));
    vi.spyOn(Network, 'askSeen').mockImplementation(() => void asks++);
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    pageActivity.noteInput();
    service = TestBed.inject(LinkWatchService);
  });

  afterEach(() => {
    for (const release of released) release();
    vi.useRealTimers();
  });

  it('asks at once and every while for as long as anybody watches, and stops once the last lets go', () => {
    const panel = watch();
    const widget = watch();
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
    pageActivity.noteInput();
    expect(asks).toBe(3);
    expect(watched.at(-1)).toBe(false);
  });

  it('starts asking again for whoever watches after everybody let go', () => {
    watch()();
    watch();

    expect(asks).toBe(2);
    expect(watched).toEqual([true, false, true]);
  });

  it('asks nothing while nobody has used the page for a while, and asks at once when somebody does', () => {
    watch();
    vi.advanceTimersByTime(LOOKED_AT_MS);
    const before = asks;
    vi.advanceTimersByTime(SEEN_ASK_INTERVAL_MS * 3);
    expect(asks).toBe(before);
    expect(watched.at(-1)).toBe(false);

    pageActivity.noteInput();
    expect(asks).toBe(before + 1);
    expect(watched.at(-1)).toBe(true);
    pageActivity.noteInput();
    expect(asks).toBe(before + 1);
  });

  it('asks a full while after asking again on the page being used, not straight after', () => {
    watch();
    vi.advanceTimersByTime(LOOKED_AT_MS + SEEN_ASK_INTERVAL_MS / 2);
    const before = asks;

    pageActivity.noteInput();
    vi.advanceTimersByTime(SEEN_ASK_INTERVAL_MS - 1);
    expect(asks).toBe(before + 1);
    vi.advanceTimersByTime(1);
    expect(asks).toBe(before + 2);
  });

  it('notes when it began asking, and again when it asks after nobody looked, and forgets once nobody watches', () => {
    const release = watch();
    const began = service.resumedAt();
    expect(began).toBe(Date.now());

    vi.advanceTimersByTime(SEEN_ASK_INTERVAL_MS);
    expect(service.resumedAt()).toBe(began);
    vi.advanceTimersByTime(LOOKED_AT_MS);
    pageActivity.noteInput();
    expect(service.resumedAt()).toBe(Date.now());

    release();
    expect(service.resumedAt()).toBe(-Infinity);
  });

  it('asks nothing while the page is hidden, and asks at once when it is shown again', () => {
    visibility = 'hidden';
    watch();
    vi.advanceTimersByTime(LOOKED_AT_MS * 2);
    expect(asks).toBe(0);
    expect(watched.at(-1)).toBe(false);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));

    expect(asks).toBe(1);
    expect(watched.at(-1)).toBe(true);
  });

  it('asks nothing outside a room on a room server, and moves nothing on', () => {
    authority = null;

    watch();
    vi.advanceTimersByTime(SEEN_ASK_INTERVAL_MS);

    expect(asks).toBe(0);
    expect(watched).toEqual([]);
    expect(service.asked()).toBe(0);
  });
});
