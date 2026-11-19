import { Injectable } from '@angular/core';
import type { AnyAgentKind } from '@axe/features/agent-tools/kinds/agent-kind';

/**
 * The kinds of the chat tabs, reactions, palettes, stamps, votes, alarms, scenario texts, parties, scenes and
 * the room's own settings, as the AI link's generic tools offer them.
 */
@Injectable({ providedIn: 'root' })
export class AgentRoomKinds {
  readonly kinds: readonly AnyAgentKind[] = [];
}
