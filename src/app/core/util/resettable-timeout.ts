type TimerCallback = () => void;

export class ResettableTimeout {
  private callback: TimerCallback | null = null;
  private timerMilliSecond: number = 0;
  private timeoutDate: number = 0;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private isStopped: boolean = false;

  /**
   * Whether a timer is waiting to fire; a stopped timeout still counts until its time is up, and a
   * fired or cleared one does not.
   */
  get isActive(): boolean {
    return this.timeoutTimer !== null;
  }

  constructor(callback: TimerCallback, ms: number) {
    this.callback = callback;
    this.timerMilliSecond = ms;
    this.reset();
  }

  /**
   * Keeps the callback from running when the time comes, until `reset` is
   * called; the timer itself runs on.
   */
  stop() {
    this.isStopped = true;
  }

  /**
   * Cancels the timer and forgets the callback and duration, so a later `reset` must pass a
   * callback again.
   */
  clear() {
    this.callback = null;
    this.timerMilliSecond = 0;
    this.timeoutDate = 0;
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    this.timeoutTimer = null;
    this.isStopped = false;
  }

  /**
   * Pushes the deadline to the full duration from now, optionally with a new callback
   * or duration, and undoes `stop`.
   *
   * When the deadline only moves later the running timer is kept and waits again when it fires,
   * so calling this often is cheap.
   */
  reset(callbackOrMs?: TimerCallback | number, ms?: number): void {
    if (typeof callbackOrMs === 'function') {
      this.callback = callbackOrMs;
      this.timerMilliSecond = ms!;
    } else if (typeof callbackOrMs === 'number') {
      this.timerMilliSecond = callbackOrMs;
    }
    this.isStopped = false;

    const oldTimeoutDate = this.timeoutDate;
    this.timeoutDate = performance.now() + this.timerMilliSecond;

    if (this.timeoutTimer !== null && oldTimeoutDate <= this.timeoutDate) return;
    this.setTimeout();
  }

  private setTimeout() {
    if (this.timeoutTimer !== null) clearTimeout(this.timeoutTimer);
    this.timeoutTimer = null;
    if (!this.callback) return;

    this.timeoutTimer = setTimeout(() => {
      this.timeoutTimer = null;
      if (this.isStopped) return;

      if (performance.now() < this.timeoutDate) {
        this.setTimeout();
      } else {
        if (this.callback) this.callback();
      }
    }, this.timeoutDate - performance.now());
  }
}
