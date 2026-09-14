import { isPeerRole, PeerRole } from '@axe/domain/peer/peer-role';

const INVITE_HASH_PREFIX = '#join?';

export interface InviteLinkParams {
  roomId: string;
  roomName: string;
  password: string;
  role: PeerRole | null;
  /** Whether it opens as an overlay for a stream. It touches nothing at the table and is how this screen alone looks. */
  overlay: boolean;
}

/**
 * The link to share so others can join a room, carrying its id, name and, when set, password, role and overlay
 * flag in the URL hash.
 *
 * The password is only masked so it does not read plainly in the link; anyone holding the link can recover it.
 */
export function buildInviteLink(baseUrl: string, params: InviteLinkParams): string {
  const query = new URLSearchParams();
  query.set('r', params.roomId);
  query.set('n', params.roomName);
  if (params.password.length > 0) {
    query.set('p', encodeInvitePassword(params.password, params.roomId + params.roomName));
  }
  if (params.role) query.set('role', params.role);
  if (params.overlay) query.set('overlay', '1');

  return `${baseUrl}${INVITE_HASH_PREFIX}${query.toString()}`;
}

/**
 * Reads a room invitation from a URL hash.
 *
 * Null when the hash is not an invitation or lacks the room id or name. An unknown role reads as no role, and
 * a password that cannot be unmasked reads as empty.
 */
export function parseInviteLink(hash: string): InviteLinkParams | null {
  if (!hash.startsWith(INVITE_HASH_PREFIX)) return null;

  const query = new URLSearchParams(hash.slice(INVITE_HASH_PREFIX.length));
  const roomId = query.get('r') ?? '';
  const roomName = query.get('n') ?? '';
  if (roomId.length < 1 || roomName.length < 1) return null;

  const encodedPassword = query.get('p') ?? '';
  const role = query.get('role');
  return {
    roomId,
    roomName,
    password: encodedPassword.length > 0 ? decodeInvitePassword(encodedPassword, roomId + roomName) : '',
    role: isPeerRole(role) ? role : null,
    overlay: query.get('overlay') === '1',
  };
}

/** Masks a room password with the salt as URL-safe base64; this hides it from a glance, not from anyone. */
export function encodeInvitePassword(password: string, salt: string): string {
  const bytes = new TextEncoder().encode(password);
  return toBase64Url(maskBytes(bytes, salt));
}

/** Unmasks a password written by {@link encodeInvitePassword}; empty when the text is not valid for that salt. */
export function decodeInvitePassword(encoded: string, salt: string): string {
  const bytes = fromBase64Url(encoded);
  if (!bytes) return '';

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(maskBytes(bytes, salt));
  } catch {
    return '';
  }
}

function maskBytes(bytes: Uint8Array, salt: string): Uint8Array {
  const key = new TextEncoder().encode(salt);
  if (key.length < 1) return bytes;

  const masked = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    masked[i] = bytes[i] ^ key[i % key.length];
  }
  return masked;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}
