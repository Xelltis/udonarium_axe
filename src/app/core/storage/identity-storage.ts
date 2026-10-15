import { ACCOUNT_USER_ID_PREFIX } from '@axe/core/network/server/server-protocol';

const STORAGE_KEY = 'udonarium-axe.identity';

export interface PersistedIdentity {
  userId: string;
  roomId: string;
  roomName: string;
  role: string;
  reConnectPass: string;
  /** The key of the room on a room server; empty for SkyWay and for anything saved before keys. */
  roomKey?: string;
  /**
   * The user id this tab goes by when nobody is logged in, kept apart from an account's, which a
   * seat may never claim without its token. Missing from anything saved before logins.
   */
  guestUserId?: string;
}

/** Whether a user id is a logged-in account's rather than a tab's own. */
export function isAccountUserId(userId: string): boolean {
  return userId.startsWith(ACCOUNT_USER_ID_PREFIX);
}

/**
 * The user id the tab goes by without a login: the one kept for that, or else the saved user id
 * when it is not an account's. Empty when there is neither.
 */
export function guestUserIdOf(identity: PersistedIdentity | null): string {
  if (!identity) return '';
  if (identity.guestUserId) return identity.guestUserId;
  return isAccountUserId(identity.userId) ? '' : identity.userId;
}

/**
 * Remembers who this tab is and which room it is in, so that a reload comes back as the same
 * user.
 *
 * It lives in session storage, so it lasts for the tab and is not shared with other tabs. Where
 * storage is unavailable nothing is kept and nothing is thrown.
 */
export function saveIdentity(identity: PersistedIdentity): void {
  // Whoever saves without naming the guest id keeps the one saved before, so a login never loses it.
  const kept = { ...identity, guestUserId: identity.guestUserId ?? guestUserIdAfter(identity.userId, loadIdentity()) };
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
    return {
      userId: parsed.userId,
      roomId: typeof parsed.roomId === 'string' ? parsed.roomId : '',
      roomName: typeof parsed.roomName === 'string' ? parsed.roomName : '',
      role: typeof parsed.role === 'string' ? parsed.role : '',
      reConnectPass: typeof parsed.reConnectPass === 'string' ? parsed.reConnectPass : '',
      roomKey: typeof parsed.roomKey === 'string' ? parsed.roomKey : '',
      guestUserId:
        typeof parsed.guestUserId === 'string' && !isAccountUserId(parsed.guestUserId) ? parsed.guestUserId : '',
    };
  } catch {
    /* corrupt or unavailable storage — fall back to a fresh identity */
    return null;
  }
}

/**
 * The guest id to keep beside a user id about to be saved: the user id itself when it is the tab's
 * own, or the one kept before when it is an account's.
 */
export function guestUserIdAfter(userId: string, saved: PersistedIdentity | null): string {
  return isAccountUserId(userId) ? guestUserIdOf(saved) : userId;
}

/** Forgets the identity saved for this tab, so the next load starts as a new user. */
export function clearIdentity(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sessionStorage unavailable — nothing to clear */
  }
}
