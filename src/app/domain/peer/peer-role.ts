export const PeerRole = {
  GameMaster: 'gm',
  Player: 'pl',
  Guest: 'guest',
} as const;

export type PeerRole = (typeof PeerRole)[keyof typeof PeerRole];

export const DEFAULT_PEER_ROLE: PeerRole = PeerRole.Player;

export const ASSIGNABLE_PEER_ROLES: readonly PeerRole[] = [PeerRole.GameMaster, PeerRole.Player, PeerRole.Guest];

/** Whether a value is one of the room roles: game master, player or guest. */
export function isPeerRole(value: unknown): value is PeerRole {
  return value === PeerRole.GameMaster || value === PeerRole.Player || value === PeerRole.Guest;
}

/** The value as a room role, reading anything unknown as a player. */
export function normalizePeerRole(value: unknown): PeerRole {
  return isPeerRole(value) ? value : DEFAULT_PEER_ROLE;
}

/** Whether a role may change things at the table; only a guest, who watches, may not. */
export function canRoleEdit(role: PeerRole): boolean {
  return role !== PeerRole.Guest;
}

/** Whether a role sees what is hidden from players; only the game master does. */
export function canRoleSeeHidden(role: PeerRole): boolean {
  return role === PeerRole.GameMaster;
}

/**
 * Whether this reader may change what the room and its tables answer for everyone.
 *
 * Wider than the rules of play, which a player may set as readily as the master: these are
 * settings one screen changes for every screen, and the panels label them so.
 */
export function canRoleEditShared(role: PeerRole): boolean {
  return role === PeerRole.GameMaster;
}

/** The translation key for a role's full name. */
export function roleLabelKey(role: PeerRole): string {
  switch (role) {
    case PeerRole.GameMaster:
      return 'feature.role.gm';
    case PeerRole.Guest:
      return 'feature.role.guest';
    default:
      return 'feature.role.player';
  }
}

/** The translation key for a role's short name, for badges; a guest uses its full name. */
export function roleShortLabelKey(role: PeerRole): string {
  switch (role) {
    case PeerRole.GameMaster:
      return 'feature.role.gmShort';
    case PeerRole.Guest:
      return 'feature.role.guest';
    default:
      return 'feature.role.playerShort';
  }
}

/** The Tailwind classes that colour a role's badge: amber for the game master, grey for guests, blue for players. */
export function roleBadgeClass(role: PeerRole): string {
  switch (role) {
    case PeerRole.GameMaster:
      return 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
    case PeerRole.Guest:
      return 'bg-zinc-500/20 text-zinc-300 border border-zinc-500/40';
    default:
      return 'bg-sky-500/20 text-sky-300 border border-sky-500/40';
  }
}
