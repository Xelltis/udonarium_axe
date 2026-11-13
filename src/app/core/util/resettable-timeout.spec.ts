import { ResettableTimeout } from '@axe/core/util/resettable-timeout';

describe('ResettableTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('is active once created', () => {
      const callback = vi.fn();
      const timer = new ResettableTimeout(callback, 1000);
      expect(timer.isActive).toBe(true);
      timer.clear();
    });
  });

  describe('calling back', () => {
    it('calls back after the time it was given', () => {
      const callback = vi.fn();
      const timer = new ResettableTimeout(callback, 1000);

      vi.advanceTimersByTime(999);
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(callback).toHaveBeenCalledTimes(1);
      timer.clear();
    });

    it('calls back once', () => {
      const callback = vi.fn();
      const timer = new ResettableTimeout(callback, 500);

      vi.advanceTimersByTime(2000);
      expect(callback).toHaveBeenCalledTimes(1);
      timer.clear();
    });
  });

  describe('stop()', () => {
    it('never calls back once stopped', () => {
      const callback = vi.fn();
      const timer = new ResettableTimeout(callback, 1000);
      timer.stop();

      vi.advanceTimersByTime(2000);
      expect(callback).not.toHaveBeenCalled();
      timer.clear();
    });
  });

  describe('clear()', () => {
    it('is inactive once cleared', () => {
      const callback = vi.fn();
      const timer = new ResettableTimeout(callback, 1000);
      timer.clear();

      expect(timer.isActive).toBe(false);
    });

    it('never calls back once cleared', () => {
      const callback = vi.fn();
      const timer = new ResettableTimeout(callback, 1000);
      timer.clear();

      vi.advanceTimersByTime(2000);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('reset()', () => {
    it('extends the wait when reset', () => {
      const callback = vi.fn();
      const timer = new ResettableTimeout(callback, 1000);

      vi.advanceTimersByTime(800);
      timer.reset();

      vi.advanceTimersByTime(800);
      expect(callback).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(callback).toHaveBeenCalledTimes(1);
      timer.clear();
    });

    it('takes a new time on reset', () => {
      const callback = vi.fn();
      const timer = new ResettableTimeout(callback, 1000);

      timer.reset(500);

      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(1);
      timer.clear();
    });

    it('takes a new callback and time on reset', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const timer = new ResettableTimeout(callback1, 1000);

      timer.reset(callback2, 500);

      vi.advanceTimersByTime(500);
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
      timer.clear();
    });

    it('keeps the time when reset with a new callback alone', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const timer = new ResettableTimeout(callback1, 1000);

      timer.reset(callback2);

      vi.advanceTimersByTime(999);
      expect(callback2).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
      timer.clear();
    });

    it('becomes active again when reset after a stop', () => {
      const callback = vi.fn();
      const timer = new ResettableTimeout(callback, 1000);
      timer.stop();
      timer.reset();

      vi.advanceTimersByTime(1000);
      expect(callback).toHaveBeenCalledTimes(1);
      timer.clear();
    });
  });
});
