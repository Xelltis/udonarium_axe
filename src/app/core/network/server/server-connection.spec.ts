import { IPeerContext } from '@axe/core/network/peer-context';
import {
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  SEND_GATHER_MS,
  ServerConnection,
} from '@axe/core/network/server/server-connection';
import { NO_BACKEND, SERVER_UNREACHABLE } from '@axe/core/network/server/server-errors';
import { decodeFrame, MAX_FRAME_BYTES } from '@axe/core/network/server/server-frames';
import {
  AUTHORITY_PEER_ID,
  EventContext,
  Member,
  PROTOCOL_VERSION,
  ServerMessage,
} from '@axe/core/network/server/server-protocol';
import { isCompressed } from '@axe/core/util/compress';
import * as MessagePack from '@axe/core/util/message-pack';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  binaryType = '';
  readonly sent: (string | Uint8Array)[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string | Uint8Array): void {
    this.sent.push(data);
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  /** The server accepts the upgrade. */
  accept(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  /** A message from the server, as a binary frame. */
  deliver(message: ServerMessage | Record<string, unknown>): void {
    const bytes = MessagePack.encode(message);
    this.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  }

  /** The decoded binary frames sent so far. */
  async frames(): Promise<Record<string, unknown>[]> {
    const binary = this.sent.filter((frame): frame is Uint8Array => typeof frame !== 'string');
    return Promise.all(binary.map(async (frame) => (await decodeFrame(frame)) as Record<string, unknown>));
  }
}

const BASE_URL = 'https://rooms.example';
const ROOM_KEY = '0123456789abcdef0123456789abcdef';
const OTHER: Member = { peerId: 'Zz9Yy8Ab3e7r6q5W-', userId: 'other-user', role: 'pl' };

function event(eventName: string, data: unknown = null): EventContext {
  return { eventName, data, sendFrom: 'me' };
}

describe('ServerConnection', () => {
  let connection: ServerConnection;
  let calls: string[];
  let errors: { code: string }[];
  let received: { from: string; events: EventContext[] }[];

  const latest = () => FakeWebSocket.instances.at(-1)!;
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function openRoom(password = ''): Promise<FakeWebSocket> {
    connection.open('my-user', 'Ab3', '月夜の卓', password, ROOM_KEY);
    await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    return latest();
  }

  async function enterRoom(members: Member[] = []): Promise<FakeWebSocket> {
    const socket = await openRoom();
    socket.accept();
    socket.deliver({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      peerId: connection.peerId,
      authorityPeerId: AUTHORITY_PEER_ID,
      role: 'pl',
      members,
      serverTime: Date.now(),
    });
    await vi.waitFor(() => expect(calls).toContain('open'));
    return socket;
  }

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    connection = new ServerConnection();
    connection.configure({ backend: { url: BASE_URL } });
    calls = [];
    errors = [];
    received = [];
    const name = (peer: IPeerContext) => (peer.peerId === AUTHORITY_PEER_ID ? 'authority' : peer.peerId);
    connection.callback.onOpen = () => calls.push('open');
    connection.callback.onClose = () => calls.push('close');
    connection.callback.onConnect = (peer) => calls.push(`connect ${name(peer)}`);
    connection.callback.onDisconnect = (peer) => calls.push(`disconnect ${name(peer)}`);
    connection.callback.onReconnect = (_peer, state) => calls.push(`reconnect ${state}`);
    connection.callback.onError = (_peer, code) => errors.push({ code });
    connection.callback.onData = (peer, data) =>
      received.push({ from: peer?.peerId ?? '', events: data as EventContext[] });
  });

  afterEach(() => {
    connection.close();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('connects to the room’s socket on the server and says hello first, with the password', async () => {
    const socket = await openRoom('secret');
    socket.accept();
    await vi.waitFor(async () => expect((await socket.frames()).length).toBe(1));

    expect(socket.url).toBe(`wss://rooms.example/v1/rooms/${ROOM_KEY}/ws`);
    expect((await socket.frames())[0]).toEqual({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      peerId: connection.peerId,
      userId: 'my-user',
      password: 'secret',
    });
  });

  it('builds a peer id that carries the room but no password', async () => {
    await openRoom('secret');

    expect(connection.peer.roomId).toBe('Ab3');
    expect(connection.peerId.endsWith('-')).toBe(true);
  });

  it('opens on the welcome, then connects the authority and the members, keeping the authority out of the peers', async () => {
    await enterRoom([OTHER]);

    expect(calls).toEqual(['open', 'connect authority', `connect ${OTHER.peerId}`]);
    expect(connection.authorityPeerId).toBe(AUTHORITY_PEER_ID);
    expect(connection.peerIds).toEqual([OTHER.peerId]);
    expect(connection.peers[0].userId).toBe(OTHER.userId);
    expect(connection.peer.isOpen).toBe(true);
  });

  it('connects and disconnects members as they join and leave', async () => {
    const socket = await enterRoom();

    socket.deliver({ type: 'join', member: OTHER });
    await vi.waitFor(() => expect(connection.peerIds).toEqual([OTHER.peerId]));
    socket.deliver({ type: 'leave', peerId: OTHER.peerId });
    await vi.waitFor(() => expect(connection.peerIds).toEqual([]));

    expect(calls.slice(-2)).toEqual([`connect ${OTHER.peerId}`, `disconnect ${OTHER.peerId}`]);
  });

  it('hands on events as sent by whoever the server says sent them', async () => {
    const socket = await enterRoom([OTHER]);

    socket.deliver({
      type: 'data',
      from: OTHER.peerId,
      events: [{ eventName: 'CHAT', data: 'hi', sendFrom: 'forged' }],
    });
    await vi.waitFor(() => expect(received.length).toBe(1));

    expect(received[0].from).toBe(OTHER.peerId);
    expect(received[0].events).toEqual([{ eventName: 'CHAT', data: 'hi', sendFrom: OTHER.peerId }]);
  });

  it('sends nothing before it is in the room', async () => {
    const socket = await openRoom();
    socket.accept();
    connection.send([event('CHAT')]);
    await new Promise((resolve) => setTimeout(resolve, SEND_GATHER_MS * 3));

    expect((await socket.frames()).map((frame) => frame['type'])).toEqual(['hello']);
  });

  it('gathers what is sent within a moment into one frame per destination, in order', async () => {
    const socket = await enterRoom([OTHER]);

    connection.send([event('A')]);
    connection.send([event('B')]);
    connection.send([event('C')], OTHER.peerId);
    await vi.waitFor(async () => expect((await socket.frames()).length).toBe(3));

    const [, broadcast, unicast] = await socket.frames();
    expect(broadcast).toEqual({ type: 'send', events: [event('A'), event('B')] });
    expect(unicast).toEqual({ type: 'send', to: OTHER.peerId, events: [event('C')] });
  });

  it('gzips a large frame, and sends the pieces of a file in frames of their own as they are', async () => {
    const socket = await enterRoom();

    connection.send([event('UPDATE', 'x'.repeat(4096)), event('FILE_SEND_CHUNK_IMAGE', 'y'.repeat(4096))]);
    await vi.waitFor(() => expect(socket.sent.length).toBe(3));

    const [, chat, chunk] = socket.sent as Uint8Array[];
    expect(isCompressed(chat)).toBe(true);
    expect(isCompressed(chunk)).toBe(false);
  });

  it('splits a batch that would make too large a frame', async () => {
    const socket = await enterRoom();
    const big = Array.from({ length: 8 }, (_, i) => event('FILE_SEND_CHUNK_IMAGE', `${i}`.repeat(MAX_FRAME_BYTES / 4)));

    connection.send(big);
    await vi.waitFor(async () => expect((await socket.frames()).length).toBeGreaterThan(2));

    const sent = (socket.sent.slice(1) as Uint8Array[]).map((frame) => frame.byteLength);
    expect(Math.max(...sent)).toBeLessThanOrEqual(MAX_FRAME_BYTES);
    const events = (await socket.frames()).slice(1).flatMap((frame) => frame['events'] as EventContext[]);
    expect(events.map((e) => e.data)).toEqual(big.map((e) => e.data));
  });

  it('ends the session on a refusal, without trying again', async () => {
    const socket = await openRoom('wrong');
    socket.accept();
    socket.deliver({ type: 'error', code: 'wrong-password', protocolVersion: PROTOCOL_VERSION });
    await settle();
    socket.close(4000, 'wrong-password');
    await vi.waitFor(() => expect(errors).toEqual([{ code: 'wrong-password' }]));

    expect(FakeWebSocket.instances.length).toBe(1);
    expect(calls).not.toContain('open');
  });

  it('says at once that a room is full when joining it, rather than waiting in line', async () => {
    const socket = await openRoom();
    socket.accept();
    socket.deliver({ type: 'error', code: 'room-full', protocolVersion: PROTOCOL_VERSION });
    await settle();
    socket.close(4000, 'room-full');
    await vi.waitFor(() => expect(errors).toEqual([{ code: 'room-full' }]));

    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it('stops quietly when the same seat connects again elsewhere, and reports that it was closed', async () => {
    const socket = await enterRoom();

    socket.deliver({ type: 'error', code: 'replaced', protocolVersion: PROTOCOL_VERSION });
    await settle();
    socket.close(4000, 'replaced');
    await vi.waitFor(() => expect(errors).toEqual([{ code: 'replaced' }]));

    expect(calls).toContain('close');
    expect(FakeWebSocket.instances.length).toBe(1);
    expect(connection.peer.isOpen).toBe(false);
  });

  it('gives up at once when it never got into the room', async () => {
    const socket = await openRoom();
    socket.close(1006);
    await vi.waitFor(() => expect(errors).toEqual([{ code: SERVER_UNREACHABLE }]));

    expect(FakeWebSocket.instances.length).toBe(1);
  });

  it('says so when no room server is configured', async () => {
    connection.configure({ backend: { url: '' } });
    connection.open('my-user', 'Ab3', '月夜の卓', '', ROOM_KEY);

    await vi.waitFor(() => expect(errors).toEqual([{ code: NO_BACKEND }]));
    expect(FakeWebSocket.instances.length).toBe(0);
  });

  it('tries again after losing a connection it was in, and is back on the next welcome', async () => {
    const socket = await enterRoom([OTHER]);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });

    socket.close(1006);

    expect(calls.slice(-3)).toEqual(['disconnect authority', `disconnect ${OTHER.peerId}`, 'reconnect retrying']);
    expect(connection.peerIds).toEqual([]);
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances.length).toBe(2);
    vi.useRealTimers();

    const again = latest();
    again.accept();
    again.deliver({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      peerId: connection.peerId,
      authorityPeerId: AUTHORITY_PEER_ID,
      role: 'pl',
      members: [OTHER],
      serverTime: Date.now(),
    });
    await vi.waitFor(() => expect(calls).toContain('reconnect recovered'));

    expect(calls.filter((call) => call === 'open')).toHaveLength(1);
    expect(calls.slice(-3)).toEqual(['reconnect recovered', 'connect authority', `connect ${OTHER.peerId}`]);
  });

  it('asks a quiet server whether it is there, and takes the connection as lost when nothing answers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const socket = await enterRoom();

    vi.advanceTimersByTime(PING_INTERVAL_MS);
    expect(socket.sent.at(-1)).toBe('ping');
    vi.advanceTimersByTime(PONG_TIMEOUT_MS);

    expect(socket.readyState).toBe(3);
    expect(calls).toContain('reconnect retrying');
  });

  it('keeps the connection while the server answers', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const socket = await enterRoom();

    vi.advanceTimersByTime(PING_INTERVAL_MS);
    socket.onmessage?.({ data: 'pong' });
    vi.advanceTimersByTime(PONG_TIMEOUT_MS);

    expect(socket.readyState).toBe(1);
  });

  it('leaves without a word when closed, and sends nothing after', async () => {
    const socket = await enterRoom();
    calls = [];

    connection.close();
    connection.send([event('CHAT')]);

    expect(socket.readyState).toBe(3);
    expect(calls).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('lists the server’s rooms for the lobby', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          rooms: [{ roomKey: ROOM_KEY, roomId: 'Ab3', name: '月夜の卓', hasPassword: true, members: 2 }],
        })
      )
    );

    const rooms = await connection.listAllRooms();

    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({
      id: 'Ab3',
      name: '月夜の卓',
      hasPassword: true,
      memberCount: 2,
      roomKey: ROOM_KEY,
    });
  });

  it('opens on standby without connecting to anything', async () => {
    connection.openStandby('my-user');

    await vi.waitFor(() => expect(calls).toEqual(['open']));
    expect(FakeWebSocket.instances.length).toBe(0);
    expect(connection.peer.isRoom).toBe(false);
  });
});
