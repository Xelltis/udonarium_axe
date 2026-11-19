import { Injectable } from '@angular/core';
import type { AnyAgentKind } from '@axe/features/agent-tools/kinds/agent-kind';

/**
 * The kinds of the cards, the stacks of them, the dice and the coins on the table, as the AI link's generic tools offer them.
 */
@Injectable({ providedIn: 'root' })
export class AgentCardKinds {
  readonly kinds: readonly AnyAgentKind[] = [];
}
