import { Injectable, signal } from '@angular/core';
import { Network } from '@axe/core/network/network';

/**
 * How often, while somebody looks at how the links are doing, the room server is asked when it last
 * heard from each of the others. Each ask wakes the room, so it is asked only so often.
 */
export const SEEN_ASK_INTERVAL_MS = 10_000;

/**
 * Watches the link to the room server closely for as long as anybody looks at how the links are
 * doing, as the connection panel and the link quality widget do: the server is pinged more often, to
 * tell how long its answers take, and asked every SEEN_ASK_INTERVAL_MS when it last heard from each of
 * the others. Nothing is asked while nobody looks, so that the room may sleep. With SkyWay, where the
 * peers' own links are measured, it does nothing but move `asked` on.
 */
@Injectable({ providedIn: 'root' })
export class LinkWatchService {
  private watchers = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Moves on each time the server is asked, so that how long ago each seat was heard from is read again. */
  readonly asked = signal(0);

  /** Watches the links closely until the function given back is called. */
  watch(): () => void {
    this.watchers++;
    if (this.watchers === 1) {
      this.ask();
      this.timer = setInterval(() => this.ask(), SEEN_ASK_INTERVAL_MS);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.watchers--;
      if (this.watchers > 0) return;
      if (this.timer !== null) clearInterval(this.timer);
      this.timer = null;
      Network.watchLink(false);
    };
  }

  private ask(): void {
    Network.watchLink(true);
    Network.askSeen();
    this.asked.update((count) => count + 1);
  }
}
