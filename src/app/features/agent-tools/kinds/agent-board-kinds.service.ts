import { Injectable } from '@angular/core';
import type { AnyAgentKind } from '@axe/features/agent-tools/kinds/agent-kind';

/**
 * The kinds of the things laid on the table besides pieces and notes: terrain, masks, white boards, lights, ground
 * effects, background layers, rulers and effect fields, as the AI link's generic tools offer them.
 */
@Injectable({ providedIn: 'root' })
export class AgentBoardKinds {
  readonly kinds: readonly AnyAgentKind[] = [];
}
