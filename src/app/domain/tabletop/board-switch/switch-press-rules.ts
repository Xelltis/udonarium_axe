import { canRoleSpeakTab, ChatTabPermission } from '@axe/domain/chat/chat-tab-permission';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { SwitchDefinition, switchDoesAnything } from '@axe/domain/tabletop/board-switch/switch-definition';

/**
 * Why a press came to nothing.
 *
 * `nothing` is a switch with nothing written in it; `watching` is somebody watching the table
 * pressing a switch not left open to watchers; `cannotSpeak` is a switch that would speak into a
 * tab the presser may not speak in; `retired` is a switch taken off the table for good; `spent` is
 * one with no press left for this presser; `noPiece` and `tooFar` are a switch that has to be
 * reached, pressed by somebody with no piece on the table or with one too far from it; `unseen` is
 * one that has to be seen, pressed by somebody who cannot see it.
 */
export type SwitchRefusal =
  'nothing' | 'watching' | 'cannotSpeak' | 'retired' | 'spent' | 'noPiece' | 'tooFar' | 'unseen';

/** Every reason a press can be turned away, for whatever has to put each into words. */
export const SWITCH_REFUSALS: readonly SwitchRefusal[] = [
  'nothing',
  'watching',
  'cannotSpeak',
  'retired',
  'spent',
  'noPiece',
  'tooFar',
  'unseen',
];

/** Where the presser's piece stands from a switch that has to be reached. */
export type SwitchReach = 'near' | 'tooFar' | 'noPiece';

export interface SwitchPressState {
  definition: SwitchDefinition;
  role: PeerRole;
  /** The tab the switch would speak into, or null where the room has none. */
  tab: ChatTabPermission | null;
  retired: boolean;
  /** Whether it has a press left for this presser. */
  hasGo?: boolean;
  /**
   * Where the presser's piece stands, for a switch that has to be reached: near enough, too far,
   * or nowhere on the table at all.
   */
  reach?: SwitchReach;
  /** Whether the presser can see the switch. */
  inSight?: boolean;
  /** Whether the master is trying it out, which leaves its count alone. */
  trial?: boolean;
}

/**
 * Whether this press is turned away, and why, or null where the switch may go ahead.
 *
 * The chat's own sending does not ask whether somebody may speak in a tab, since the chat window
 * asks before it sends. A switch speaks without the chat window, so it asks here instead, and a
 * switch that says anything at all is held to the tab it says it into.
 *
 * The master is not held to where a switch has to be reached from or seen from, since the master
 * is the one who set it up and looks at the whole table; the count holds for the master as for
 * anyone, bar a trial, which is not a press.
 */
export function pressRefusal(state: SwitchPressState): SwitchRefusal | null {
  const { definition } = state;
  if (state.retired) return 'retired';
  if (!switchDoesAnything(definition)) return 'nothing';
  if (state.role === PeerRole.Guest && !definition.guests) return 'watching';
  const speaks = definition.actions.some((action) => action.kind === 'say' && action.text.trim().length > 0);
  if (speaks && (!state.tab || !canRoleSpeakTab(state.tab, state.role))) return 'cannotSpeak';
  if (!state.trial && state.hasGo === false) return 'spent';
  if (state.role === PeerRole.GameMaster) return null;
  if (definition.range > 0 && state.reach !== undefined && state.reach !== 'near') return state.reach;
  if (definition.needsSight && state.inSight === false) return 'unseen';
  return null;
}
