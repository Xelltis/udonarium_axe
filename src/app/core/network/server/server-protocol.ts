/**
 * The protocol between Udonarium Axe and a room server (the Cloudflare backend's RoomDurableObject).
 *
 * The server owns it, in `apps/cloudflare/contracts` of udonarium_axe_backend. The client keeps
 * its own copy of the types here, and the fixtures in `contract/`, copied over by
 * `scripts/sync-server-contract.mjs`, hold both sides to the same messages.
 *
 * A WebSocket frame is binary: one envelope (a client or server message) in MessagePack, gzipped
 * as a whole when that is smaller, which the leading bytes 1f 8b give away. A text frame is only
 * ever `ping`, answered with `pong` without waking the server.
 */

/** Raised whenever an envelope changes; a hello at another version is refused with protocol-mismatch. */
export const PROTOCOL_VERSION = 2;

/** The room server's own peer id, a shape no client id can take. */
export const AUTHORITY_PEER_ID = '@authority';

export const PING = 'ping';
export const PONG = 'pong';

export const MAX_ROOM_NAME_LENGTH = 255;
export const MAX_PASSWORD_LENGTH = 64;
/** How many can be in one room at once. */
export const MAX_MEMBERS = 32;

/** The WebSocket close code the server closes with after an error message. */
export const CLOSE_CODE = 4000;

/** An event between clients. The server reads only the sync events and passes the rest on untouched. */
export interface EventContext {
  eventName: string;
  data: unknown;
  /** The sender's peer id, which the server overwrites with that of the connection it came on. */
  sendFrom: string;
}

/**
 * A part in the room, which the server decides and keeps; it overwrites the role on PeerCursors.
 *
 * The same values as the client's own roles: the room's creator and those the GM makes one are
 * `gm`, those logged in are `pl`, and those not logged in watch as `guest`.
 */
export const SERVER_ROLES = ['gm', 'pl', 'guest'] as const;
export type ServerRole = (typeof SERVER_ROLES)[number];

/** Whether a value is one of the server's roles. */
export function isServerRole(value: unknown): value is ServerRole {
  return (SERVER_ROLES as readonly unknown[]).includes(value);
}

/**
 * How the user id of somebody logged in begins. A hello without an access token may not claim
 * one, since what a member may see follows their user id.
 */
export const ACCOUNT_USER_ID_PREFIX = 'acct_';

/** Somebody in the room. */
export interface Member {
  peerId: string;
  userId: string;
  role: ServerRole;
}

// ---- client to server ----

/** The first message on a connection; nothing before it is accepted. */
export interface HelloMessage {
  type: 'hello';
  protocolVersion: number;
  peerId: string;
  userId: string;
  /** For a room with a password, which the server checks. */
  password?: string;
  /** Logged in, the access token; without one the server seats a guest. The userId must be its account's. */
  accessToken?: string;
  /** An invitation from a link, deciding the role of somebody logged in on their first visit. */
  invite?: string;
}

/** A batch of events, for one peer when `to` is given and for everybody else otherwise. */
export interface SendMessage {
  type: 'send';
  to?: string;
  events: EventContext[];
}

/** Asks the server for its clock. */
export interface TimeRequest {
  type: 'time';
}

/** Asks for an invitation to the room in a role; only a GM gets one. */
export interface InviteRequest {
  type: 'invite';
  role: ServerRole;
}

/**
 * Hands the server a fresh access token without reconnecting. A seat that logged in is closed as
 * unauthorized a minute after its token runs out unless a new one arrives.
 */
export interface AuthMessage {
  type: 'auth';
  accessToken: string;
}

export type ClientMessage = HelloMessage | SendMessage | TimeRequest | InviteRequest | AuthMessage;

// ---- server to client ----

/** The answer to a hello that got in. The server's catalog follows straight after. */
export interface WelcomeMessage {
  type: 'welcome';
  protocolVersion: number;
  peerId: string;
  authorityPeerId: string;
  /** The role the server gives this client, which its own PeerCursor takes on. */
  role: ServerRole;
  /** Who else is in the room: never this client, never the server. */
  members: Member[];
  /** The server's clock, in Unix milliseconds. */
  serverTime: number;
}

export interface JoinMessage {
  type: 'join';
  member: Member;
}

export interface LeaveMessage {
  type: 'leave';
  peerId: string;
}

/**
 * A batch of events. The server may slip its own events into somebody else's batch, so each
 * event's `sendFrom`, not the batch's `from`, says who sent it.
 */
export interface DataMessage {
  type: 'data';
  from: string;
  events: EventContext[];
}

export interface TimeMessage {
  type: 'time';
  serverTime: number;
}

/** The answer to an invite request: the invitation and when it runs out, both null for a non-GM. */
export interface InviteMessage {
  type: 'invite';
  role: ServerRole;
  invite: string | null;
  /** Unix milliseconds. */
  expiresAt: number | null;
}

/**
 * Why the server is closing the connection. It sends this, then closes with CLOSE_CODE and the
 * code as the reason; `contract/errors.json` says when each comes.
 */
export const ERROR_CODES = [
  'protocol-mismatch',
  'room-not-found',
  'room-full',
  'wrong-password',
  'hello-required',
  'bad-message',
  'too-many-messages',
  'replaced',
  'unauthorized',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * The refusals that may go away, so that connecting again is worth trying: a full room or a busy
 * sender later, and an expired access token once it is refreshed.
 */
export const RETRYABLE_ERROR_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'room-full',
  'too-many-messages',
  'unauthorized',
]);

/** Whether a code the server closed with is one worth connecting again for. */
export function isRetryableError(code: string): boolean {
  return (RETRYABLE_ERROR_CODES as ReadonlySet<string>).has(code);
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  protocolVersion?: number;
}

export type ServerMessage =
  WelcomeMessage | JoinMessage | LeaveMessage | DataMessage | TimeMessage | InviteMessage | ErrorMessage;

// ---- events with the server ----

/**
 * Events only the server and its members trade.
 *
 * - AUTHORITATIVE (from the server): an ObjectContext to take on whatever its version, clearing any
 *   deletion mark; it undoes a change the sender may not make, or hands over a thing that came
 *   into view
 * - WITHDRAW (from the server): `{ identifier }` to take away without marking it deleted, for a
 *   thing that went out of view or that the sender may not make
 * - ROLE_REQUEST (to the server): `{ peerId, role }`, a GM changing somebody's role
 * - ROLE_REJECTED (from the server): `{ peerId, role, reason }`, a ROLE_REQUEST turned down
 * - ROLL_REQUEST (to the server): a RollRequest, rolled with BCDice and said to everybody
 */
export const AuthorityEvent = {
  AUTHORITATIVE: 'AUTHORITATIVE_OBJECT',
  WITHDRAW: 'WITHDRAW_GAME_OBJECT',
  ROLE_REQUEST: 'ROLE_REQUEST',
  ROLE_REJECTED: 'ROLE_REJECTED',
  ROLL_REQUEST: 'ROLL_REQUEST',
} as const;

/** Why a ROLE_REQUEST was turned down. */
export type RoleRejectReason = 'not-game-master' | 'unknown-peer' | 'not-logged-in' | 'last-game-master';

/** A thing as it travels between peers; ObjectNode SyncVars sit under `syncData.attributes`. */
export interface ServerObjectContext {
  aliasName: string;
  identifier: string;
  majorVersion: number;
  minorVersion: number;
  syncData: Record<string, unknown>;
}

/**
 * Asks the server to roll a chat line's dice. The message is the result line the client would
 * have said itself, not yet placed; the server fills in its text, roll detail, tag, name, sender
 * and SERVER_ROLL_FIELD and says it to everybody, the asker included.
 */
export interface RollRequest {
  message: ServerObjectContext;
  /** The command in half-width characters, perhaps with a repeat count in front (`3 2d6`). */
  command: string;
  /** The game system's id; an unknown one rolls with the plain DiceBot. */
  gameSystem: string;
  /** The speaker's name, which the result line is named after. */
  speaker: string;
  /** What follows the result text, such as the name of the targeted character. */
  suffix?: string;
}

/** The sender of a line the server rolled. */
export const DICE_BOT_SENDER = 'System-BCDice';

/** The attribute the server sets true on a line it rolled, and strips from any a client sends. */
export const SERVER_ROLL_FIELD = 'serverRoll';

// ---- HTTP ----

export interface CreateRoomRequest {
  name: string;
  password?: string;
}

/** The answer to creating a room. The key finds the room again; the id is only shown. */
export interface CreateRoomResponse {
  roomKey: string;
  roomId: string;
}

export interface RoomSummary {
  roomKey: string;
  roomId: string;
  name: string;
  hasPassword: boolean;
  /** How many are in it now. */
  members: number;
}

export interface RoomListResponse {
  rooms: RoomSummary[];
}

/** GET /v1/auth/config: the login providers; none means the Worker has neither login nor rooms. */
export interface AuthConfigResponse {
  providers: string[];
}

/** POST /v1/auth/token: a login code with its PKCE verifier, or a refresh token to trade in. */
export type TokenRequest =
  | { grant_type: 'login_code'; code: string; code_verifier: string }
  | { grant_type: 'refresh_token'; refresh_token: string };

/** Somebody logged in. */
export interface Account {
  /** Their lasting user id, beginning with ACCOUNT_USER_ID_PREFIX, which a hello carries. */
  userId: string;
  name: string;
  avatarUrl: string | null;
}

/** The answer to POST /v1/auth/token. */
export interface TokenResponse {
  accessToken: string;
  /** Seconds the access token lasts. */
  expiresIn: number;
  /** Trades in once for the next pair; a second use revokes the whole line. */
  refreshToken: string;
  account: Account;
}

/** What a hello may carry beyond who is saying it. */
export interface HelloOptions {
  password?: string;
  accessToken?: string;
  invite?: string;
}

/** The hello for a peer, carrying the password, access token and invitation only when there are some. */
export function helloMessage(peerId: string, userId: string, options: HelloOptions = {}): HelloMessage {
  const hello: HelloMessage = { type: 'hello', protocolVersion: PROTOCOL_VERSION, peerId, userId };
  if (options.password) hello.password = options.password;
  if (options.accessToken) hello.accessToken = options.accessToken;
  if (options.invite) hello.invite = options.invite;
  return hello;
}

/** Asks for an invitation in a role. */
export function inviteRequest(role: ServerRole): InviteRequest {
  return { type: 'invite', role };
}

/** Hands over a fresh access token. */
export function authMessage(accessToken: string): AuthMessage {
  return { type: 'auth', accessToken };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isMember = (value: unknown): value is Member =>
  isRecord(value) &&
  typeof value['peerId'] === 'string' &&
  typeof value['userId'] === 'string' &&
  isServerRole(value['role']);

const isStringOrNull = (value: unknown): boolean => value === null || typeof value === 'string';
const isNumberOrNull = (value: unknown): boolean => value === null || typeof value === 'number';

const isEvent = (value: unknown): value is EventContext => isRecord(value) && typeof value['eventName'] === 'string';

/**
 * A decoded frame from the server as a message, or null when it has a shape no message has.
 *
 * Fields the client does not read are let through, and optional ones may be missing or null.
 */
export function readServerMessage(value: unknown): ServerMessage | null {
  if (!isRecord(value)) return null;
  switch (value['type']) {
    case 'welcome':
      return typeof value['protocolVersion'] === 'number' &&
        typeof value['peerId'] === 'string' &&
        typeof value['authorityPeerId'] === 'string' &&
        isServerRole(value['role']) &&
        Array.isArray(value['members']) &&
        value['members'].every(isMember) &&
        typeof value['serverTime'] === 'number'
        ? (value as unknown as WelcomeMessage)
        : null;
    case 'join':
      return isMember(value['member']) ? (value as unknown as JoinMessage) : null;
    case 'leave':
      return typeof value['peerId'] === 'string' ? (value as unknown as LeaveMessage) : null;
    case 'data':
      return typeof value['from'] === 'string' && Array.isArray(value['events']) && value['events'].every(isEvent)
        ? (value as unknown as DataMessage)
        : null;
    case 'time':
      return typeof value['serverTime'] === 'number' ? (value as unknown as TimeMessage) : null;
    case 'invite':
      return isServerRole(value['role']) && isStringOrNull(value['invite']) && isNumberOrNull(value['expiresAt'])
        ? (value as unknown as InviteMessage)
        : null;
    case 'error':
      return typeof value['code'] === 'string' ? (value as unknown as ErrorMessage) : null;
    default:
      return null;
  }
}

/** The room list the server answered with, or null when it is not one. */
export function readRoomList(value: unknown): RoomSummary[] | null {
  if (!isRecord(value) || !Array.isArray(value['rooms'])) return null;
  const rooms = value['rooms'];
  const valid = rooms.every(
    (room) =>
      isRecord(room) &&
      typeof room['roomKey'] === 'string' &&
      typeof room['roomId'] === 'string' &&
      typeof room['name'] === 'string' &&
      typeof room['hasPassword'] === 'boolean' &&
      typeof room['members'] === 'number'
  );
  return valid ? (rooms as RoomSummary[]) : null;
}
