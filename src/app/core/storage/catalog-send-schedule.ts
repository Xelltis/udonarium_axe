import { ResettableTimeout } from '@axe/core/util/resettable-timeout';

/**
 * When a storage sends its catalogue: now, or a little later with the calls made meanwhile.
 *
 * Calls made while one is waiting fold into it. Calls for the same peer send to that peer;
 * calls for different peers, or for everyone, send to everyone. A waiting catalogue goes out
 * the given time after the first call, however many follow, so a steady run of finished
 * transfers cannot hold it back for good.
 *
 * A catalogue sent to everyone now stands in for the one waiting. One sent to a single peer
 * now stands in only for a waiting one meant for that same peer.
 */
export class CatalogSendSchedule {
  private timer: ResettableTimeout | null = null;
  /** Who the waiting catalogue goes to: a peer, everyone (undefined), or nothing waiting (null). */
  private waitingFor: string | undefined | null = null;

  constructor(private readonly send: (peer: string | undefined) => void) {}

  /** Sends the catalogue now, to one peer or to everyone. */
  now(peer?: string): void {
    if (this.waitingFor !== null && (peer === undefined || this.waitingFor === peer)) {
      this.timer?.stop();
      this.waitingFor = null;
    }
    this.send(peer);
  }

  /** Sends the catalogue ms after the first of the calls that come before it goes. */
  later(ms: number, peer?: string): void {
    if (this.waitingFor !== null) {
      if (this.waitingFor !== peer) this.waitingFor = undefined;
      return;
    }
    this.waitingFor = peer;
    if (this.timer === null) {
      this.timer = new ResettableTimeout(() => {
        const target = this.waitingFor;
        this.waitingFor = null;
        if (target !== null) this.send(target);
      }, ms);
    }
    this.timer.reset(ms);
  }

  /** Forgets a catalogue waiting to go out. */
  cancel(): void {
    this.timer?.clear();
    this.timer = null;
    this.waitingFor = null;
  }
}
