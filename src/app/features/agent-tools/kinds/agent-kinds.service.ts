import { inject, Injectable } from '@angular/core';
import { AgentAssetKinds } from '@axe/features/agent-tools/kinds/agent-asset-kinds.service';
import { AgentBoardKinds } from '@axe/features/agent-tools/kinds/agent-board-kinds.service';
import { AgentCardKinds } from '@axe/features/agent-tools/kinds/agent-card-kinds.service';
import type { AnyAgentKind } from '@axe/features/agent-tools/kinds/agent-kind';
import { AgentMapKinds } from '@axe/features/agent-tools/kinds/agent-map-kinds.service';
import { AgentMediaKinds } from '@axe/features/agent-tools/kinds/agent-media-kinds.service';
import { AgentPaletteKinds } from '@axe/features/agent-tools/kinds/agent-palette-kinds.service';
import { AgentRoomKinds } from '@axe/features/agent-tools/kinds/agent-room-kinds.service';
import { AgentTableKinds } from '@axe/features/agent-tools/kinds/agent-table-kinds.service';

/** Every kind of thing the AI link's generic tools offer, gathered from the services that define them. */
@Injectable({ providedIn: 'root' })
export class AgentKinds {
  private readonly gathered: readonly AnyAgentKind[] = [
    ...inject(AgentTableKinds).kinds,
    ...inject(AgentPaletteKinds).kinds,
    ...inject(AgentBoardKinds).kinds,
    ...inject(AgentCardKinds).kinds,
    ...inject(AgentMapKinds).kinds,
    ...inject(AgentMediaKinds).kinds,
    ...inject(AgentRoomKinds).kinds,
    ...inject(AgentAssetKinds).kinds,
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
