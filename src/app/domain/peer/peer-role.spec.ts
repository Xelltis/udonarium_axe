import {
  ASSIGNABLE_PEER_ROLES,
  canRoleEdit,
  canRoleEditShared,
  canRoleSeeHidden,
  DEFAULT_PEER_ROLE,
  isPeerRole,
  normalizePeerRole,
  PeerRole,
  roleBadgeClass,
  roleLabelKey,
  roleShortLabelKey,
} from '@axe/domain/peer/peer-role';

describe('canRoleEditShared()', () => {
  it('lets the master answer for the room and its tables', () => {
    expect(canRoleEditShared(PeerRole.GameMaster)).toBe(true);
  });

  it('keeps a player to the rules of play, not to what every screen sees', () => {
    expect(canRoleEditShared(PeerRole.Player)).toBe(false);
    expect(canRoleEditShared(PeerRole.Guest)).toBe(false);
  });
});

describe('peer-role', () => {
  it('defaults to Player', () => {
    expect(DEFAULT_PEER_ROLE).toBe(PeerRole.Player);
  });

  it('recognizes valid roles', () => {
    for (const role of ASSIGNABLE_PEER_ROLES) {
      expect(isPeerRole(role)).toBe(true);
    }
    expect(isPeerRole('spectator')).toBe(false);
    expect(isPeerRole(undefined)).toBe(false);
    expect(isPeerRole('')).toBe(false);
  });

  it('normalizes unknown values to the default role', () => {
    expect(normalizePeerRole('gm')).toBe(PeerRole.GameMaster);
    expect(normalizePeerRole('unknown')).toBe(DEFAULT_PEER_ROLE);
    expect(normalizePeerRole(undefined)).toBe(DEFAULT_PEER_ROLE);
  });

  it('blocks editing only for guests', () => {
    expect(canRoleEdit(PeerRole.GameMaster)).toBe(true);
    expect(canRoleEdit(PeerRole.Player)).toBe(true);
    expect(canRoleEdit(PeerRole.Guest)).toBe(false);
  });

  it('allows seeing hidden info only for the game master', () => {
    expect(canRoleSeeHidden(PeerRole.GameMaster)).toBe(true);
    expect(canRoleSeeHidden(PeerRole.Player)).toBe(false);
    expect(canRoleSeeHidden(PeerRole.Guest)).toBe(false);
  });

  it('maps every role to label, short label and badge class', () => {
    for (const role of ASSIGNABLE_PEER_ROLES) {
      expect(roleLabelKey(role)).toMatch(/^feature\.role\./);
      expect(roleShortLabelKey(role)).toMatch(/^feature\.role\./);
      expect(roleBadgeClass(role).length).toBeGreaterThan(0);
    }
    expect(roleLabelKey(PeerRole.GameMaster)).toBe('feature.role.gm');
    expect(roleShortLabelKey(PeerRole.Player)).toBe('feature.role.playerShort');
  });
});
