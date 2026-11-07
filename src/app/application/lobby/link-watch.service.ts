import { Injectable, signal } from '@angular/core';
import { Network } from '@axe/core/network/network';
import { pageActivity } from '@axe/core/network/server/page-activity';

/**
 * How often, while somebody looks at how the links are doing, the room server is asked when it last
 * heard from each of the others. Each ask wakes the room, so it is asked only so often.
 */
export const SEEN_ASK_INTERVAL_MS = 10_000;
/**
 * How long after somebody last used the page it still counts as looked at. A page left open with
 * nobody at it, or hidden, asks nothing, so that the room may sleep while everybody is away.
 */
export const LOOKED_AT_MS = 60_000;

/**
 * Watches the link to the room server closely for as long as anybody looks at how the links are
 * doing, as the connection panel and the link quality widget do: the server is pinged more often, to
 * tell how long its answers take, and asked every SEEN_ASK_INTERVAL_MS when it last heard from each of
 * the others. A panel open behind others still counts, so the page must also be shown, and used or
 * shown again within LOOKED_AT_MS; using or showing it again asks at once. Nothing is asked
 * otherwise, nor with SkyWay, where the peers' own links are measured, so that the room may sleep.
 */
@Injectable({ providedIn: 'root' })
export class LinkWatchService {
  private watchers = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Whether the last ask found nobody looking, so that the page used or shown again asks at once. */
  private paused = false;
  private stopHearing: (() => void) | null = null;
  /** When the page was last shown again, which counts as being looked at as a use of it does. */
  private shownAt = -Infinity;
  private readonly comeBack = (): void => {
    if (document.visibilityState === 'visible') this.shownAt = Date.now();
    if (this.paused) this.ask();
  };

  /** Moves on each time the server is asked, so that how long ago each seat was heard from is read again. */
  readonly asked = signal(0);

  /** Watches the links closely until the function given back is called. */
  watch(): () => void {
    this.watchers++;
    if (this.watchers === 1) {
      this.ask();
      this.timer = setInterval(() => this.ask(), SEEN_ASK_INTERVAL_MS);
      const stopInput = pageActivity.onInput(this.comeBack);
      document.addEventListener('visibilitychange', this.comeBack);
      this.stopHearing = () => {
        stopInput();
        document.removeEventListener('visibilitychange', this.comeBack);
      };
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.watchers--;
      if (this.watchers > 0) return;
      if (this.timer !== null) clearInterval(this.timer);
      this.timer = null;
      this.stopHearing?.();
      this.stopHearing = null;
      this.paused = false;
      Network.watchLink(false);
    };
  }

  private ask(): void {
    if (Network.authorityPeerId === null) return;
    const lookedAt =
      document.visibilityState === 'visible' &&
      Date.now() - Math.max(pageActivity.lastInputAt, this.shownAt) < LOOKED_AT_MS;
    Network.watchLink(lookedAt);
    this.paused = !lookedAt;
    if (!lookedAt) return;
    Network.askSeen();
    this.asked.update((count) => count + 1);
  }
}
