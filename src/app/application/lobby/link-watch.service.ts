import { Injectable, signal, untracked } from '@angular/core';
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
  private stopHearing: (() => void) | null = null;
  /** When the page was last shown again, which counts as being looked at as a use of it does. */
  private shownAt = -Infinity;
  private readonly isPaused = signal(false);

  /**
   * Moves on each time the server is asked, so that how long each seat has gone unheard from is
   * weighed again against the time now.
   */
  readonly asked = signal(0);
  /**
   * Whether the links are watched but nobody looks, so that nothing is asked: how long each seat
   * had gone unheard from is to be weighed as the server last said, not against the time now.
   */
  readonly paused = this.isPaused.asReadonly();
  private readonly resumed = signal(-Infinity);
  /**
   * When the server was last asked again after nobody had looked, or first asked: what it said
   * before then is weighed as it was for a while, until a fresh answer has had time to come.
   */
  readonly resumedAt = this.resumed.asReadonly();

  /**
   * Watches the links closely until the function given back is called. What it reads and writes as it
   * begins is kept from whoever calls it, so that an effect watching while a widget is shown does not
   * come to follow the asking it set going.
   */
  watch(): () => void {
    this.watchers++;
    if (this.watchers === 1) untracked(() => this.begin());
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.watchers--;
      if (this.watchers === 0) untracked(() => this.end());
    };
  }

  private begin(): void {
    this.keepAsking();
    if (typeof document === 'undefined') return;
    const used = (): void => this.resume();
    const shown = (): void => {
      if (document.visibilityState === 'visible') this.shownAt = Date.now();
      this.resume();
    };
    const stopInput = pageActivity.onInput(used);
    document.addEventListener('visibilitychange', shown);
    this.stopHearing = () => {
      stopInput();
      document.removeEventListener('visibilitychange', shown);
    };
  }

  private end(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.resumed.set(-Infinity);
    this.stopHearing?.();
    this.stopHearing = null;
    this.isPaused.set(false);
    Network.watchLink(false);
  }

  /** Asks now and every SEEN_ASK_INTERVAL_MS from now. */
  private keepAsking(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.ask();
    this.timer = setInterval(() => this.ask(), SEEN_ASK_INTERVAL_MS);
  }

  /** Asks at once on the page being used or shown again after nobody looked, and every while from then. */
  private resume(): void {
    if (this.isPaused()) this.keepAsking();
  }

  private ask(): void {
    if (Network.authorityPeerId === null) return;
    const lookedAt =
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible' &&
      Date.now() - Math.max(pageActivity.lastInputAt, this.shownAt) < LOOKED_AT_MS;
    Network.watchLink(lookedAt);
    if (lookedAt && (this.isPaused() || this.resumed() === -Infinity)) this.resumed.set(Date.now());
    this.isPaused.set(!lookedAt);
    if (!lookedAt) return;
    Network.askSeen();
    this.asked.update((count) => count + 1);
  }
}
