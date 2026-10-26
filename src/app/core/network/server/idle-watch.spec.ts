import { IDLE_WARNING_MS, IdleWatch } from '@axe/core/network/server/idle-watch';
import { pageActivity } from '@axe/core/network/server/page-activity';
import { ACTIVE_REPORT_SECONDS, IDLE_SECONDS } from '@axe/core/network/server/server-protocol';

describe('IdleWatch', () => {
  const WARN_AFTER_MS = IDLE_SECONDS * 1000 - IDLE_WARNING_MS;
  let inRoom: boolean;
  let reported: number;
  let told: string[];
  let watch: IdleWatch;

  beforeEach(() => {
    vi.useFakeTimers();
    inRoom = true;
    reported = 0;
    told = [];
    watch = new IdleWatch({
      inRoom: () => inRoom,
      reportActive: () => reported++,
      tell: (state) => told.push(state),
    });
  });

  afterEach(() => {
    watch.end();
    vi.useRealTimers();
  });

  it('warns a while before the seat would be let out, counted from the use the server heard of', () => {
    watch.start(Date.now() - 60_000);

    vi.advanceTimersByTime(WARN_AFTER_MS - 60_001);
    expect(told).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(told).toEqual(['soon']);
  });

  it('says active for a use long enough after the last one reported, and puts the warning off', () => {
    watch.start(Date.now());

    vi.advanceTimersByTime(ACTIVE_REPORT_SECONDS * 1000 - 1);
    pageActivity.noteInput();
    expect(reported).toBe(0);
    vi.advanceTimersByTime(1);
    pageActivity.noteInput();
    expect(reported).toBe(1);

    vi.advanceTimersByTime(WARN_AFTER_MS - 1);
    expect(told).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(told).toEqual(['soon']);
  });

  it('says the page is in use again after a warning', () => {
    watch.start(Date.now());
    vi.advanceTimersByTime(WARN_AFTER_MS);

    pageActivity.noteInput();

    expect(told).toEqual(['soon', 'back']);
    expect(reported).toBe(1);
  });

  it('neither warns nor reports out of the room', () => {
    watch.start(Date.now());
    inRoom = false;

    vi.advanceTimersByTime(WARN_AFTER_MS);
    pageActivity.noteInput();

    expect(told).toEqual([]);
    expect(reported).toBe(0);
  });

  it('hears nothing once stopped, and keeps a warning given for the seat getting back in', () => {
    watch.start(Date.now());
    vi.advanceTimersByTime(WARN_AFTER_MS);
    watch.stop();

    vi.advanceTimersByTime(IDLE_WARNING_MS);
    pageActivity.noteInput();
    expect(told).toEqual(['soon']);
    expect(reported).toBe(0);

    watch.start(Date.now() - ACTIVE_REPORT_SECONDS * 1000);
    pageActivity.noteInput();
    expect(told).toEqual(['soon', 'back']);
  });

  it('forgets the warning once ended', () => {
    watch.start(Date.now());
    vi.advanceTimersByTime(WARN_AFTER_MS);
    watch.end();

    watch.start(Date.now() - ACTIVE_REPORT_SECONDS * 1000);
    pageActivity.noteInput();

    expect(told).toEqual(['soon']);
    expect(reported).toBe(1);
  });
});
