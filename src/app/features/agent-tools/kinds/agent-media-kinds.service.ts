import { Injectable } from '@angular/core';
import type { AnyAgentKind } from '@axe/features/agent-tools/kinds/agent-kind';

/**
 * The kinds of what is seen and heard: cut-ins, the visual novel stage, the jukebox, ambient sounds, sound
 * effects, playlists and effect presets, as the AI link's generic tools offer them.
 */
@Injectable({ providedIn: 'root' })
export class AgentMediaKinds {
  readonly kinds: readonly AnyAgentKind[] = [];
}
