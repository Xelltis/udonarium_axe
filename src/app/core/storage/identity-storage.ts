import { ACCOUNT_USER_ID_PREFIX } from '@axe/core/network/server/server-protocol';

const STORAGE_KEY = 'udonarium-axe.identity';

export interface PersistedIdentity {
  userId: string;
  roomId: string;
  roomName: string;
  role: string;
  /**
   * The role the seat held in the room it was last in, written only from inside that room, where a
   * role taken outside changes `role` alone. Anything saved before it is read as `role`.
   */
  roomRole?: string;
  reConnectPass: string;
  /** The key of the room on a room server; empty for SkyWay and for anything saved before keys. */
  roomKey?: string;
  /**
   * The user id this tab goes by when nobody is logged in, kept apart from an account's, which a
   * seat may never claim without its token. Missing from anything saved before logins.
   */
  guestUserId?: string;
  /**
   * The user id of the account this tab was last logged in as, which it still knows after a logout.
   * An account made before ids had their prefix is told from a tab's own id only by this.
   */
  accountUserId?: string;
}

/** Whether a user id looks like a logged-in account's rather than a tab's own. */
export function isAccountUserId(userId: string): boolean {
  return userId.startsWith(ACCOUNT_USER_ID_PREFIX);
}

/** Whether a user id is an account's, by its look or by the account the identity says the tab was in. */
function isAccountOf(userId: string, identity: PersistedIdentity | null, accountUserId = ''): boolean {
  if (isAccountUserId(userId)) return true;
  return (
    (!!accountUserId && userId === accountUserId) || (!!identity?.accountUserId && userId === identity.accountUserId)
  );
}

/**
 * The user id the tab goes by without a login: the one kept for that, or else the saved user id.
 * Empty when there is neither, or when that is an account's, the one logged in now or the one the
 * identity says the tab was in.
 */
export function guestUserIdOf(identity: PersistedIdentity | null, accountUserId = ''): string {
  if (!identity) return '';
  const userId = identity.guestUserId || identity.userId;
  return isAccountOf(userId, identity, accountUserId) ? '' : userId;
}

/**
 * Remembers who this tab is and which room it is in, so that a reload comes back as the same
 * user.
 *
 * It lives in session storage, so it lasts for the tab and is not shared with other tabs. Where
 * storage is unavailable nothing is kept and nothing is thrown.
 */
export function saveIdentity(identity: PersistedIdentity): void {
  // Whoever saves without naming the guest id or the account keeps those saved before, so a login
  // never loses the one, nor a logout the other.
  const saved = loadIdentity();
  const accountUserId = identity.accountUserId || saved?.accountUserId || '';
  const kept = {
    ...identity,
    roomRole: identity.roomRole ?? identity.role,
    accountUserId,
    guestUserId: identity.guestUserId ?? guestUserIdAfter(identity.userId, saved, accountUserId),
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch {
    /* sessionStorage unavailable (private mode, SSR etc) — identity continuity is best-effort */
  }
}

/**
 * The identity this tab saved before a reload, or null when there is none, it cannot
 * be read, or it has no user id.
 */
export function loadIdentity(): PersistedIdentity | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedIdentity> | null;
    if (!parsed || typeof parsed.userId !== 'string' || parsed.userId.length < 1) return null;
    // Saved after logins came and before the account was kept beside it, a user id the tab saved as
    // its guest id may have been an account's, which nothing else can tell any more: it is taken as one.
    const accountUserId =
      typeof parsed.accountUserId === 'string'
        ? parsed.accountUserId
        : typeof parsed.guestUserId === 'string'
          ? parsed.userId
          : '';
    const role = typeof parsed.role === 'string' ? parsed.role : '';
    return {
      userId: parsed.userId,
      roomId: typeof parsed.roomId === 'string' ? parsed.roomId : '',
      roomName: typeof parsed.roomName === 'string' ? parsed.roomName : '',
      role,
      roomRole: typeof parsed.roomRole === 'string' ? parsed.roomRole : role,
      reConnectPass: typeof parsed.reConnectPass === 'string' ? parsed.reConnectPass : '',
      roomKey: typeof parsed.roomKey === 'string' ? parsed.roomKey : '',
      guestUserId:
        typeof parsed.guestUserId === 'string' && !isAccountOf(parsed.guestUserId, null, accountUserId)
          ? parsed.guestUserId
          : '',
      accountUserId,
    };
  } catch {
    /* corrupt or unavailable storage — fall back to a fresh identity */
    return null;
  }
}

/**
 * The guest id to keep beside a user id about to be saved: the user id itself when it is the tab's
 * own, or the one kept before when it is an account's, the one logged in now or the one before.
 */
export function guestUserIdAfter(userId: string, saved: PersistedIdentity | null, accountUserId = ''): string {
  return isAccountOf(userId, saved, accountUserId) ? guestUserIdOf(saved, accountUserId) : userId;
}

/** Forgets the identity saved for this tab, so the next load starts as a new user. */
export function clearIdentity(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sessionStorage unavailable — nothing to clear */
  }
}
