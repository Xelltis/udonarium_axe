import { PACE_WINDOW_MS, SEND_BUDGET_EVENTS, SEND_BUDGET_FRAMES, SendPacer } from '@axe/core/network/server/send-pacer';

describe('SendPacer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function batchOf(events: number): { events: unknown[] } {
    return { events: new Array<unknown>(events).fill(null) };
  }

  /** Whether the wait for room has ended, once the promises queued so far have run. */
  async function settled(wait: Promise<void>): Promise<boolean> {
    let done = false;
    void wait.then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    return done;
  }

  it('lets a batch through at once while nothing was written', async () => {
    const pacer = new SendPacer();

    expect(await settled(pacer.roomFor(batchOf(SEND_BUDGET_EVENTS * 2), 1, () => true))).toBe(true);
  });

  it('lets a batch through at once while it fits in what the window has left', async () => {
    const pacer = new SendPacer();
    pacer.wrote(SEND_BUDGET_EVENTS - 10, 1);

    expect(await settled(pacer.roomFor(batchOf(10), 1, () => true))).toBe(true);
  });

  it('holds a batch over the events left until the first write leaves the window', async () => {
    const pacer = new SendPacer();
    pacer.wrote(SEND_BUDGET_EVENTS - 10, 1);
    vi.advanceTimersByTime(1000);
    pacer.wrote(5, 1);
    const wait = pacer.roomFor(batchOf(10), 1, () => true);

    expect(await settled(wait)).toBe(false);
    await vi.advanceTimersByTimeAsync(PACE_WINDOW_MS - 1000 - 1);
    expect(await settled(wait)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await settled(wait)).toBe(true);
  });

  it('holds a batch over the frames left as well', async () => {
    const pacer = new SendPacer();
    pacer.wrote(1, SEND_BUDGET_FRAMES);
    const wait = pacer.roomFor(batchOf(1), 1, () => true);

    expect(await settled(wait)).toBe(false);
    await vi.advanceTimersByTimeAsync(PACE_WINDOW_MS);
    expect(await settled(wait)).toBe(true);
  });

  it('lets a batch over the budget on its own go once the window is empty', async () => {
    const pacer = new SendPacer();
    pacer.wrote(1, 1);
    const wait = pacer.roomFor(batchOf(SEND_BUDGET_EVENTS + 1), 1, () => true);

    expect(await settled(wait)).toBe(false);
    await vi.advanceTimersByTimeAsync(PACE_WINDOW_MS);
    expect(await settled(wait)).toBe(true);
  });

  it('counts the batch as it stands each time it looks again', async () => {
    const pacer = new SendPacer();
    pacer.wrote(SEND_BUDGET_EVENTS, 1);
    vi.advanceTimersByTime(1000);
    pacer.wrote(SEND_BUDGET_EVENTS - 10, 1);
    const batch = batchOf(20);
    const wait = pacer.roomFor(batch, 1, () => true);
    batch.events.length = 10;

    await vi.advanceTimersByTimeAsync(PACE_WINDOW_MS - 1000);
    expect(await settled(wait)).toBe(true);
  });

  it('stops waiting on a reset, for a batch no longer wanted', async () => {
    const pacer = new SendPacer();
    pacer.wrote(SEND_BUDGET_EVENTS, 1);
    let wanted = true;
    const wait = pacer.roomFor(batchOf(1), 1, () => wanted);
    expect(await settled(wait)).toBe(false);

    wanted = false;
    pacer.reset();

    expect(await settled(wait)).toBe(true);
  });

  it('counts afresh after a reset', async () => {
    const pacer = new SendPacer();
    pacer.wrote(SEND_BUDGET_EVENTS, SEND_BUDGET_FRAMES);
    pacer.reset();

    expect(await settled(pacer.roomFor(batchOf(SEND_BUDGET_EVENTS), 1, () => true))).toBe(true);
  });
});
