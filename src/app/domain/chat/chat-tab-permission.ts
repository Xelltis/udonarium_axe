import { PeerRole } from '@axe/domain/peer/peer-role';

export interface ChatTabPermission {
  plCanView: boolean;
  plCanSpeak: boolean;
  guestCanView: boolean;
  guestCanSpeak: boolean;
  isSystemTab?: boolean;
}

/**
 * Whether a role may read a tab. The game master reads every tab; players and guests follow the
 * tab's own settings.
 */
export function canRoleViewTab(tab: ChatTabPermission, role: PeerRole): boolean {
  if (role === PeerRole.GameMaster) return true;
  return role === PeerRole.Guest ? tab.guestCanView : tab.plCanView;
}

/**
 * Whether a role may speak in a tab. Nobody speaks in the system tab; elsewhere the game master
 * speaks anywhere, and players and guests follow the tab's own settings.
 */
export function canRoleSpeakTab(tab: ChatTabPermission, role: PeerRole): boolean {
  // It is a noticeboard, which nobody writes on, the game master included.
  if (tab.isSystemTab) return false;
  if (role === PeerRole.GameMaster) return true;
  return role === PeerRole.Guest ? tab.guestCanSpeak : tab.plCanSpeak;
}
