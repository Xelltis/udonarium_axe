/**
 * When a storage sends its catalogue: now, or a little later with the calls made meanwhile.
 *
 * Calls made while one is waiting fold into it. Calls for the same peer send to that peer;
 * calls for different peers, or for everyone, send to everyone.
 *
 * There are two ways to wait. A waiting catalogue goes out the given time after the first call
 * to later, however many follow, so a steady run of finished transfers cannot hold it back for
 * good. Calls to whenQuiet put it back until they stop for the given time, so files added one
 * after another go out as one catalogue at the end; they never put back the time a call to later
 * is waiting for.
 *
 * A catalogue sent to everyone now stands in for the one waiting. One sent to a single peer
 * now stands in only for a waiting one meant for that same peer.
 */
export class CatalogSendSchedule {
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Who the waiting catalogue goes to: a peer, everyone (undefined), or nothing waiting (null). */
  private waitingFor: string | undefined | null = null;
  /** When the first call to later since the last send wants the catalogue out, or null. */
  private laterDeadline: number | null = null;
  /** When the last call to whenQuiet since the last send wants the catalogue out, or null. */
  private quietDeadline: number | null = null;

  constructor(private readonly send: (peer: string | undefined) => void) {}

  /** Sends the catalogue now, to one peer or to everyone. */
  now(peer?: string): void {
    if (this.waitingFor !== null && (peer === undefined || this.waitingFor === peer)) this.cancel();
    this.send(peer);
  }

  /** Sends the catalogue ms after the first of the calls that come before it goes. */
  later(ms: number, peer?: string): void {
    this.fold(peer);
    this.laterDeadline ??= performance.now() + ms;
    this.arm();
  }

  /** Sends the catalogue once ms pass without another call to this, or sooner for a call to later. */
  whenQuiet(ms: number, peer?: string): void {
    this.fold(peer);
    this.quietDeadline = performance.now() + ms;
    this.arm();
  }

  /** Forgets a catalogue waiting to go out. */
  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.waitingFor = null;
    this.laterDeadline = null;
    this.quietDeadline = null;
  }

  private fold(peer: string | undefined): void {
    this.waitingFor = this.waitingFor === null || this.waitingFor === peer ? peer : undefined;
  }

  private arm(): void {
    const deadline = Math.min(this.laterDeadline ?? Infinity, this.quietDeadline ?? Infinity);
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        const target = this.waitingFor;
        this.cancel();
        if (target !== null) this.send(target);
      },
      Math.max(0, deadline - performance.now())
    );
  }
}
