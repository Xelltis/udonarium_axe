import { PEER_RECONNECT_BACKOFF_MS, PeerReconnectScheduler } from '@axe/core/network/peer-reconnect-scheduler';

describe('PeerReconnectScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('the default backoff only grows', () => {
    for (let i = 1; i < PEER_RECONNECT_BACKOFF_MS.length; i++) {
      expect(PEER_RECONNECT_BACKOFF_MS[i]).toBeGreaterThan(PEER_RECONNECT_BACKOFF_MS[i - 1]);
    }
  });

  it('calls back once the delay has passed', () => {
    const scheduler = new PeerReconnectScheduler([100, 200]);
    const run = vi.fn();

    expect(scheduler.schedule('peer-a', run)).toBe(100);
    expect(run).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('lengthens the delay with each attempt', () => {
    const scheduler = new PeerReconnectScheduler([100, 200, 400]);

    expect(scheduler.schedule('peer-a', () => {})).toBe(100);
    vi.advanceTimersByTime(100);
    expect(scheduler.schedule('peer-a', () => {})).toBe(200);
    vi.advanceTimersByTime(200);
    expect(scheduler.schedule('peer-a', () => {})).toBe(400);
  });

  it('returns nothing and schedules nothing once the backoff runs out', () => {
    const scheduler = new PeerReconnectScheduler([100]);
    const run = vi.fn();

    expect(scheduler.schedule('peer-a', run)).toBe(100);
    vi.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(1);

    expect(scheduler.schedule('peer-a', run)).toBeNull();
    vi.advanceTimersByTime(10000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('goes on at the steady delay once the backoff runs out, where it is given one', () => {
    const scheduler = new PeerReconnectScheduler([100], 500);
    const run = vi.fn();

    expect(scheduler.schedule('peer-a', run)).toBe(100);
    vi.advanceTimersByTime(100);
    expect(scheduler.isPastBackoff('peer-a')).toBe(false);

    expect(scheduler.schedule('peer-a', run)).toBe(500);
    expect(scheduler.isPastBackoff('peer-a')).toBe(true);
    vi.advanceTimersByTime(500);
    expect(scheduler.schedule('peer-a', run)).toBe(500);
    vi.advanceTimersByTime(500);
    expect(run).toHaveBeenCalledTimes(3);

    scheduler.reset('peer-a');
    expect(scheduler.isPastBackoff('peer-a')).toBe(false);
    expect(scheduler.schedule('peer-a', run)).toBe(100);
    scheduler.cancelAll();
  });

  it('schedules nothing while one is still pending', () => {
    const scheduler = new PeerReconnectScheduler([100, 200]);
    const run = vi.fn();

    expect(scheduler.schedule('peer-a', run)).toBe(100);
    expect(scheduler.schedule('peer-a', run)).toBeNull();

    vi.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('counts the attempts per peer', () => {
    const scheduler = new PeerReconnectScheduler([100, 200]);

    expect(scheduler.schedule('peer-a', () => {})).toBe(100);
    expect(scheduler.schedule('peer-b', () => {})).toBe(100);

    vi.advanceTimersByTime(100);
    expect(scheduler.schedule('peer-a', () => {})).toBe(200);
    expect(scheduler.attemptOf('peer-b')).toBe(1);
  });

  it('cancelling drops the schedule but keeps the count', () => {
    const scheduler = new PeerReconnectScheduler([100, 200]);
    const run = vi.fn();

    scheduler.schedule('peer-a', run);
    scheduler.cancel('peer-a');

    vi.advanceTimersByTime(10000);
    expect(run).not.toHaveBeenCalled();
    expect(scheduler.attemptOf('peer-a')).toBe(1);
    expect(scheduler.schedule('peer-a', run)).toBe(200);
  });

  it('resetting drops both', () => {
    const scheduler = new PeerReconnectScheduler([100, 200]);
    const run = vi.fn();

    scheduler.schedule('peer-a', run);
    scheduler.reset('peer-a');

    vi.advanceTimersByTime(10000);
    expect(run).not.toHaveBeenCalled();
    expect(scheduler.attemptOf('peer-a')).toBe(0);
    expect(scheduler.schedule('peer-a', run)).toBe(100);
  });

  it('cancelling everything drops both for every peer', () => {
    const scheduler = new PeerReconnectScheduler([100, 200]);
    const run = vi.fn();

    scheduler.schedule('peer-a', run);
    scheduler.schedule('peer-b', run);
    expect(scheduler.scheduledPeerIds).toEqual(['peer-a', 'peer-b']);

    scheduler.cancelAll();

    vi.advanceTimersByTime(10000);
    expect(run).not.toHaveBeenCalled();
    expect(scheduler.scheduledPeerIds).toEqual([]);
    expect(scheduler.attemptOf('peer-a')).toBe(0);
  });

  it('is no longer pending once it has fired', () => {
    const scheduler = new PeerReconnectScheduler([100]);

    scheduler.schedule('peer-a', () => {});
    expect(scheduler.isScheduled('peer-a')).toBe(true);

    vi.advanceTimersByTime(100);
    expect(scheduler.isScheduled('peer-a')).toBe(false);
  });
});
