import { canRoleEdit, PeerRole } from '@axe/domain/peer/peer-role';

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

/**
 * Whether a role may manage a tab: rename it, move it, delete it, change who may read and speak in
 * it, save it and clear its log. Only a role that may change the room may, and only for a tab it may
 * read, so that what is kept from a seat is neither shown to it nor in its reach. The game master
 * manages every tab.
 */
export function canRoleManageTab(tab: ChatTabPermission, role: PeerRole): boolean {
  return canRoleEdit(role) && canRoleViewTab(tab, role);
}
