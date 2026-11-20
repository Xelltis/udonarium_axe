import {
  canRoleManageTab,
  canRoleSpeakTab,
  canRoleViewTab,
  ChatTabPermission,
} from '@axe/domain/chat/chat-tab-permission';
import { PeerRole } from '@axe/domain/peer/peer-role';

const tab = (overrides: Partial<ChatTabPermission> = {}): ChatTabPermission => ({
  plCanView: true,
  plCanSpeak: true,
  guestCanView: true,
  guestCanSpeak: false,
  ...overrides,
});

describe('chat-tab-permission', () => {
  it('lets the GM view and speak in any tab', () => {
    const locked = tab({ plCanView: false, plCanSpeak: false, guestCanView: false, guestCanSpeak: false });
    expect(canRoleViewTab(locked, PeerRole.GameMaster)).toBe(true);
    expect(canRoleSpeakTab(locked, PeerRole.GameMaster)).toBe(true);
  });

  it('applies the player flags for the player role', () => {
    expect(canRoleViewTab(tab({ plCanView: false }), PeerRole.Player)).toBe(false);
    expect(canRoleViewTab(tab({ plCanView: true }), PeerRole.Player)).toBe(true);
    expect(canRoleSpeakTab(tab({ plCanSpeak: false }), PeerRole.Player)).toBe(false);
    expect(canRoleSpeakTab(tab({ plCanSpeak: true }), PeerRole.Player)).toBe(true);
  });

  it('nobody may speak in the system tab', () => {
    const system = tab({ isSystemTab: true, plCanSpeak: true, guestCanSpeak: true });
    expect(canRoleSpeakTab(system, PeerRole.GameMaster)).toBe(false);
    expect(canRoleSpeakTab(system, PeerRole.Player)).toBe(false);
    expect(canRoleSpeakTab(system, PeerRole.Guest)).toBe(false);
    expect(canRoleViewTab(system, PeerRole.Player)).toBe(true);
  });

  it('applies the guest flags for the guest role (default: view yes, speak no)', () => {
    expect(canRoleViewTab(tab(), PeerRole.Guest)).toBe(true);
    expect(canRoleSpeakTab(tab(), PeerRole.Guest)).toBe(false);
    expect(canRoleViewTab(tab({ guestCanView: false }), PeerRole.Guest)).toBe(false);
    expect(canRoleSpeakTab(tab({ guestCanSpeak: true }), PeerRole.Guest)).toBe(true);
  });

  it('lets a role manage only a tab it may read, and a guest none', () => {
    const closed = tab({ plCanView: false, plCanSpeak: false, guestCanView: false });
    expect(canRoleManageTab(closed, PeerRole.GameMaster)).toBe(true);
    expect(canRoleManageTab(closed, PeerRole.Player)).toBe(false);
    expect(canRoleManageTab(tab(), PeerRole.Player)).toBe(true);
    expect(canRoleManageTab(tab(), PeerRole.Guest)).toBe(false);
  });
});
