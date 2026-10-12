import { Injectable } from '@angular/core';
import { Logger } from '@axe/core/logging/logger';

/**
 * What else happens as a turn ends, for whatever keeps rules that wait on the turn.
 *
 * The round calls it on the peer that pressed it, alone, as it counts the buffs down there: a room
 * of five would otherwise do it five times over. A hook that throws is logged and left behind, so
 * the round keeps turning.
 */
@Injectable({ providedIn: 'root' })
export class TurnHooksService {
  private readonly turnEndHooks = new Set<() => void>();

  /** Runs `hook` each time a turn ends, until the function handed back is called. */
  onTurnEnd(hook: () => void): () => void {
    this.turnEndHooks.add(hook);
    return () => this.turnEndHooks.delete(hook);
  }

  /** Says that a turn has ended. */
  turnEnded(): void {
    for (const hook of [...this.turnEndHooks]) {
      try {
        hook();
      } catch (error) {
        Logger.error('[TurnHooks] a turn-end hook failed', error);
      }
    }
  }
}
