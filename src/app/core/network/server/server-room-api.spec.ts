import http from '@axe/core/network/server/contract/http.json';
import {
  createRoom,
  deleteRoom,
  findRoom,
  listRooms,
  ServerRoomApiError,
} from '@axe/core/network/server/server-room-api';

describe('the room server’s HTTP API, held to the server’s contract', () => {
  let sent: { url: string; method: string; body: unknown; authorization: string | null }[];
  let answer: Response;

  beforeEach(() => {
    sent = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const headers = new Headers(init?.headers);
      sent.push({
        url: String(input),
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        authorization: headers.get('Authorization'),
      });
      return answer;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('opens a room as the server takes it, and reads its answer', async () => {
    answer = json(201, http.createRoomResponse);

    const created = await createRoom('https://rooms.example', http.createRoomRequest, 'access-1');

    expect(created).toEqual(http.createRoomResponse);
    expect(sent[0]).toEqual({
      url: 'https://rooms.example/v1/rooms',
      method: 'POST',
      body: http.createRoomRequest,
      authorization: 'Bearer access-1',
    });
  });

  it('reads the room list as the server answers it, marks included', async () => {
    answer = json(200, http.roomList);

    expect(await listRooms('https://rooms.example', 'access-1')).toEqual(http.roomList.rooms);
  });

  it('finds one room by its key as the server answers it, and nothing for a key it has no room for', async () => {
    answer = json(200, http.room);
    expect(await findRoom('https://rooms.example', 'k'.repeat(32), 'access-1')).toEqual(http.room.room);
    expect(sent.at(-1)).toMatchObject({
      url: `https://rooms.example/v1/rooms/${'k'.repeat(32)}`,
      authorization: 'Bearer access-1',
    });

    answer = json(404, { error: 'room-not-found' });
    expect(await findRoom('https://rooms.example', 'k'.repeat(32))).toBeNull();

    answer = json(429, { error: 'rate-limited' });
    await expect(findRoom('https://rooms.example', 'k'.repeat(32))).rejects.toBeInstanceOf(ServerRoomApiError);
  });

  it('reads an error the way the server answers one', async () => {
    answer = json(404, http.error);

    const failure = await deleteRoom('https://rooms.example', 'k'.repeat(32), 'access-1').catch((error) => error);

    expect(failure).toBeInstanceOf(ServerRoomApiError);
    expect((failure as ServerRoomApiError).code).toBe(http.error.error);
  });
});
