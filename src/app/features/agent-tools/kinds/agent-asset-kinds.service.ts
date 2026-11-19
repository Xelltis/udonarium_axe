import { Injectable } from '@angular/core';
import type { AnyAgentKind } from '@axe/features/agent-tools/kinds/agent-kind';

/**
 * The kinds of the pictures, sounds and models held, their tags, locks, owners and removals, and the pieces,
 * their sheets and the ranges on the table, as the AI link's generic tools offer them.
 */
@Injectable({ providedIn: 'root' })
export class AgentAssetKinds {
  readonly kinds: readonly AnyAgentKind[] = [];
}
