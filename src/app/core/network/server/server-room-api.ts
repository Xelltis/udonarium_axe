import { IPeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo } from '@axe/core/network/room-info';
import {
  CreateRoomRequest,
  CreateRoomResponse,
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

/** Creates a room on the server, which answers with the key to find it by and the id to show. */
export async function createRoom(baseUrl: string, request: CreateRoomRequest): Promise<CreateRoomResponse> {
  const response = await fetch(apiUrl(baseUrl, '/v1/rooms'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) return refusal(response);
  const body = (await response.json().catch(() => null)) as Partial<CreateRoomResponse> | null;
  if (typeof body?.roomKey !== 'string' || typeof body?.roomId !== 'string') {
    throw new ServerRoomApiError(response.status, 'bad-response');
  }
  return { roomKey: body.roomKey, roomId: body.roomId };
}

/** The rooms on the server. */
export async function listRooms(baseUrl: string): Promise<RoomSummary[]> {
  const response = await fetch(apiUrl(baseUrl, '/v1/rooms'));
  if (!response.ok) return refusal(response);
  const rooms = readRoomList(await response.json().catch(() => null));
  if (!rooms) throw new ServerRoomApiError(response.status, 'bad-response');
  return rooms;
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
    filterByPassword: () => [],
  };
}
