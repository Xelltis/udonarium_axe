import type { AgentEvent } from '@axe/application/agent/agent-event-log.service';
import type { GmWake } from '@axe/core/agent/agent-protocol';

/** When the game master takes a turn: whenever a player speaks, or only when it is called. */
export type AiGmMode = 'respond' | 'called';

/** What the tab weighs an event against to tell whether it calls for a turn of the game master. */
export interface AiGmWakeContext {
  readonly mode: AiGmMode;
  /** The name the game master is called by in a line; empty for none. */
  readonly callName: string;
  /** Whether a chat line, by its id, was said at the seat the game master acts through. */
  readonly saidHere: (lineId: string) => boolean;
  /** Whether a chat line, by its id, is a whisper to the seat the game master acts through. */
  readonly whisperedHere: (lineId: string) => boolean;
  /** The chat tabs listened to, by identifier; none for every tab. */
  readonly tabs: readonly string[];
  /** Whether the game master runs a piece. */
  readonly runsPiece: (pieceId: string) => boolean;
}

/**
 * Whether something that happened calls for a turn of the game master, and why: a line it is called
 * by name in or whispered to it (`called`), the turn of a piece it runs (`turn`), or, when it answers
 * every line, a person's line in a tab it listens to (`line`). Its own lines, lines the table puts
 * out and lines of the person at its own seat call for nothing, but still reach it with the next turn.
 */
export function aiGmWakeOf(event: AgentEvent, context: AiGmWakeContext): GmWake | undefined {
  if (event.kind === 'turn') return event.current && context.runsPiece(event.current.id) ? 'turn' : undefined;
  if (event.kind !== 'chat' || event.by_ai || event.system || !event.seat) return undefined;
  if (context.saidHere(event.id)) return undefined;
  if (context.whisperedHere(event.id)) return 'called';
  const name = context.callName.trim().toLowerCase();
  if (name && (event.text ?? '').toLowerCase().includes(name)) return 'called';
  if (context.mode !== 'respond') return undefined;
  return context.tabs.length === 0 || context.tabs.includes(event.tab) ? 'line' : undefined;
}
