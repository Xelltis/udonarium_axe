import { inject, Injectable } from '@angular/core';
import type { AnyAgentKind } from '@axe/features/agent-tools/kinds/agent-kind';
import { AgentPaletteKinds } from '@axe/features/agent-tools/kinds/agent-palette-kinds.service';
import { AgentTableKinds } from '@axe/features/agent-tools/kinds/agent-table-kinds.service';

/** Every kind of thing the AI link's generic tools offer, gathered from the services that define them. */
@Injectable({ providedIn: 'root' })
export class AgentKinds {
  private readonly gathered: readonly AnyAgentKind[] = [
    ...inject(AgentTableKinds).kinds,
    ...inject(AgentPaletteKinds).kinds,
  ];

  /** Every kind, in the order they are described to the AI. */
  all(): readonly AnyAgentKind[] {
    return this.gathered;
  }

  /** The kind synced under a name, or null for a name no kind is offered under. */
  of(name: string): AnyAgentKind | null {
    return this.gathered.find((kind) => kind.kind === name) ?? null;
  }
}
