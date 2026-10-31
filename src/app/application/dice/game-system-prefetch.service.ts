import { Injectable, signal } from '@angular/core';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import type GameSystemClass from 'bcdice/lib/game_system';

/** How long after a fetch that failed another is left unasked, for what looks at a system as the reader types. */
export const GAME_SYSTEM_RETRY_MS = 30_000;

/**
 * The game systems what is typed is checked and offered against, fetched for whatever only looks
 * at them as the reader types: one fetch at a time for each, and after one that failed, none again
 * for a while. Typing then never queues fetches ahead of a line being sent, which waits on the
 * same queue. A system that could not be fetched answers as the stand-in that rolls nothing, until
 * a later fetch brings it.
 */
@Injectable({ providedIn: 'root' })
export class GameSystemPrefetchService {
  private readonly arrived = signal(0);
  private readonly fetched = new Map<string, GameSystemClass>();
  private readonly inFlight = new Set<string>();
  private readonly failedAt = new Map<string, number>();

  /** Counts each fetch as it comes back, for what reads a system to look at it again. */
  readonly arrivals = this.arrived.asReadonly();

  /**
   * The system for an id when its code is here, or the stand-in for one that could not be fetched;
   * null while it is on the way. A fetch is asked for where none is under way or failed lately.
   */
  systemFor(gameType: string): GameSystemClass | null {
    this.arrived();
    const loaded = DiceBot.loadedGameSystem(gameType) ?? this.fetched.get(gameType) ?? null;
    if (loaded && !DiceBot.isUnreachable(loaded)) return loaded;
    const failed = this.failedAt.get(gameType);
    if (failed === undefined || Date.now() - failed >= GAME_SYSTEM_RETRY_MS) this.fetch(gameType);
    return loaded;
  }

  private fetch(gameType: string): void {
    if (this.inFlight.has(gameType)) return;
    this.inFlight.add(gameType);
    void DiceBot.loadGameSystemAsync(gameType)
      .then((system) => {
        this.fetched.set(gameType, system);
        if (DiceBot.isUnreachable(system)) this.failedAt.set(gameType, Date.now());
        else this.failedAt.delete(gameType);
      })
      .catch(() => this.failedAt.set(gameType, Date.now()))
      .finally(() => {
        this.inFlight.delete(gameType);
        this.arrived.update((count) => count + 1);
      });
  }
}
