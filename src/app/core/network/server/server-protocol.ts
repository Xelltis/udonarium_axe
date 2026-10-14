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
export const PROTOCOL_VERSION = 1;

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

/** Somebody in the room. */
export interface Member {
  peerId: string;
  userId: string;
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

export type ClientMessage = HelloMessage | SendMessage | TimeRequest;

// ---- server to client ----

/** The answer to a hello that got in. The server's catalog follows straight after. */
export interface WelcomeMessage {
  type: 'welcome';
  protocolVersion: number;
  peerId: string;
  authorityPeerId: string;
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

/** A batch of events from one sender, the server itself when `from` is the authority. */
export interface DataMessage {
  type: 'data';
  from: string;
  events: EventContext[];
}

export interface TimeMessage {
  type: 'time';
  serverTime: number;
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
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** The refusals that may go away on their own, so that connecting again later is worth trying. */
export const RETRYABLE_ERROR_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['room-full', 'too-many-messages']);

/** Whether a code the server closed with is one worth connecting again for. */
export function isRetryableError(code: string): boolean {
  return (RETRYABLE_ERROR_CODES as ReadonlySet<string>).has(code);
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  protocolVersion?: number;
}

export type ServerMessage = WelcomeMessage | JoinMessage | LeaveMessage | DataMessage | TimeMessage | ErrorMessage;

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

/** The hello for a peer, carrying the password only when there is one. */
export function helloMessage(peerId: string, userId: string, password = ''): HelloMessage {
  const hello: HelloMessage = { type: 'hello', protocolVersion: PROTOCOL_VERSION, peerId, userId };
  if (password.length > 0) hello.password = password;
  return hello;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isMember = (value: unknown): value is Member =>
  isRecord(value) && typeof value['peerId'] === 'string' && typeof value['userId'] === 'string';

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
