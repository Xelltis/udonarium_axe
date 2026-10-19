import { IPeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo } from '@axe/core/network/room-info';
import {
  CreateRoomRequest,
  CreateRoomResponse,
  readRoom,
  readRoomList,
  RoomSummary,
} from '@axe/core/network/server/server-protocol';

/** A refusal from the room server's HTTP API: the status, and the code its `{"error": …}` body gave. */
export class ServerRoomApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(`room server answered ${status} ${code}`);
    this.name = 'ServerRoomApiError';
  }
}

/** The backend url without the slashes it may end in; empty when none is configured. */
export function trimBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** A path on the backend; throws `no-backend` when no url is configured. */
export function apiUrl(baseUrl: string, path: string): string {
  const base = trimBaseUrl(baseUrl);
  if (base.length === 0) throw new ServerRoomApiError(0, 'no-backend');
  return `${base}${path}`;
}

/** Throws the refusal a response that is not ok carries. */
export async function refusal(response: Response): Promise<never> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  throw new ServerRoomApiError(response.status, typeof body?.error === 'string' ? body.error : 'unknown');
}

/**
 * Creates a room on the server, which answers with the key to find it by and the id to show. Only
 * somebody logged in may, with their access token; without one the server answers login-required.
 */
export async function createRoom(
  baseUrl: string,
  request: CreateRoomRequest,
  accessToken: string | null = null
): Promise<CreateRoomResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const response = await fetch(apiUrl(baseUrl, '/v1/rooms'), {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });
  if (!response.ok) return refusal(response);
  const body = (await response.json().catch(() => null)) as Partial<CreateRoomResponse> | null;
  if (typeof body?.roomKey !== 'string' || typeof body?.roomId !== 'string') {
    throw new ServerRoomApiError(response.status, 'bad-response');
  }
  return { roomKey: body.roomKey, roomId: body.roomId };
}

/** The rooms on the server. With an access token, the server marks the ones its holder may delete. */
export async function listRooms(baseUrl: string, accessToken: string | null = null): Promise<RoomSummary[]> {
  const headers: Record<string, string> = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const response = await fetch(apiUrl(baseUrl, '/v1/rooms'), { headers });
  if (!response.ok) return refusal(response);
  const rooms = readRoomList(await response.json().catch(() => null));
  if (!rooms) throw new ServerRoomApiError(response.status, 'bad-response');
  return rooms;
}

/**
 * One room on the server, found by its key, though the list shows only the newest: null when the
 * server has no such room. With an access token, the server marks it if its holder may delete it.
 */
export async function findRoom(
  baseUrl: string,
  roomKey: string,
  accessToken: string | null = null
): Promise<RoomSummary | null> {
  const headers: Record<string, string> = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const response = await fetch(apiUrl(baseUrl, `/v1/rooms/${encodeURIComponent(roomKey)}`), { headers });
  if (response.status === 404) return null;
  if (!response.ok) return refusal(response);
  const room = readRoom(await response.json().catch(() => null));
  if (!room) throw new ServerRoomApiError(response.status, 'bad-response');
  return room;
}

/**
 * Deletes a room on the server, closing it for everybody in it. Only a GM of the room may, with
 * their access token; anybody else is refused with not-game-master.
 */
export async function deleteRoom(baseUrl: string, roomKey: string, accessToken: string | null): Promise<void> {
  const headers: Record<string, string> = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  const response = await fetch(apiUrl(baseUrl, `/v1/rooms/${encodeURIComponent(roomKey)}`), {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) return refusal(response);
}

/** The address of a room's WebSocket, on the host of the API. */
export function roomSocketUrl(baseUrl: string, roomKey: string): string {
  const url = new URL(apiUrl(baseUrl, `/v1/rooms/${encodeURIComponent(roomKey)}/ws`));
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/** A room as the lobby lists it. The server counts who is in it rather than naming them. */
export function roomInfoOf(summary: RoomSummary): IRoomInfo {
  return {
    id: summary.roomId,
    name: summary.name,
    hasPassword: summary.hasPassword,
    peers: [] as IPeerContext[],
    memberCount: summary.members,
    roomKey: summary.roomKey,
    deletable: summary.deletable === true,
    filterByPassword: () => [],
  };
}
