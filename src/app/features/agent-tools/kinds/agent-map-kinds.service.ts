import { Injectable } from '@angular/core';
import type { AnyAgentKind } from '@axe/features/agent-tools/kinds/agent-kind';

/**
 * The kinds of the tables themselves and what the map editor and the game master lay on them: triggers, move
 * costs, switches, what is put out of sight, the fog, the engagement zones and the ground, as the AI link's generic tools offer them.
 */
@Injectable({ providedIn: 'root' })
export class AgentMapKinds {
  readonly kinds: readonly AnyAgentKind[] = [];
}
