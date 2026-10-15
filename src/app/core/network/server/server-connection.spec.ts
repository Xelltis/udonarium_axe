import { IPeerContext } from '@axe/core/network/peer-context';
import {
  ASSET_TOKEN_MARGIN_MS,
  ASSET_TOKEN_WAIT_MS,
  INVITE_TIMEOUT_MS,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  SEND_GATHER_MS,
  ServerConnection,
  TOKEN_CHECK_MS,
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
      assetToken: 'asset-1',
      assetTokenExpiresAt: Date.now() + 15 * 60_000,
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

  it('hands on each event as sent by whoever the server says sent it, even inside another’s batch', async () => {
    const socket = await enterRoom([OTHER]);

    socket.deliver({
      type: 'data',
      from: OTHER.peerId,
      events: [
        { eventName: 'CHAT', data: 'hi', sendFrom: OTHER.peerId },
        { eventName: 'WITHDRAW_GAME_OBJECT', data: { identifier: 'x' }, sendFrom: AUTHORITY_PEER_ID },
        { eventName: 'CHAT', data: 'unsigned' },
      ],
    });
    await vi.waitFor(() => expect(received.length).toBe(1));

    expect(received[0].from).toBe(OTHER.peerId);
    expect(received[0].events.map((event) => event.sendFrom)).toEqual([OTHER.peerId, AUTHORITY_PEER_ID, OTHER.peerId]);
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
      assetToken: 'asset-1',
      assetTokenExpiresAt: Date.now() + 15 * 60_000,
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

  it('takes a silent link as lost at once, without waiting for a close that may never come', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const socket = await enterRoom([OTHER]);
    socket.close = () => {
      socket.readyState = 2;
    };

    vi.advanceTimersByTime(PING_INTERVAL_MS + PONG_TIMEOUT_MS);

    expect(calls.slice(-3)).toEqual(['disconnect authority', `disconnect ${OTHER.peerId}`, 'reconnect retrying']);
  });

  it('keeps a roll and a role change asked for while getting back in, and sends them once back', async () => {
    const socket = await enterRoom();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    socket.close(1006);
    connection.send([event('ROLL_REQUEST', { command: '2d6' }), event('CHAT')], AUTHORITY_PEER_ID);
    connection.send([event('UPDATE_GAME_OBJECT')]);
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();

    const again = latest();
    again.accept();
    again.deliver({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      peerId: connection.peerId,
      authorityPeerId: AUTHORITY_PEER_ID,
      role: 'pl',
      members: [],
      serverTime: Date.now(),
      assetToken: 'asset-1',
      assetTokenExpiresAt: Date.now() + 15 * 60_000,
    });

    await vi.waitFor(async () => expect((await again.frames()).length).toBe(2));
    expect((await again.frames())[1]).toEqual({
      type: 'send',
      to: AUTHORITY_PEER_ID,
      events: [event('ROLL_REQUEST', { command: '2d6' })],
    });
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

  it('reaches the room’s pictures and sounds with the welcome’s token while in the room, and not outside', async () => {
    expect(connection.assetAccess).toBeNull();

    const socket = await enterRoom();

    expect(connection.assetAccess).toEqual({ roomKey: ROOM_KEY, token: 'asset-1' });
    socket.close(1006);
    await vi.waitFor(() => expect(connection.assetAccess).toBeNull());
  });

  it('asks once for a fresh asset token a while before it runs out, and takes what comes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const socket = await openRoom();
    socket.accept();
    socket.deliver({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      peerId: connection.peerId,
      authorityPeerId: AUTHORITY_PEER_ID,
      role: 'pl',
      members: [],
      serverTime: Date.now(),
      assetToken: 'asset-1',
      assetTokenExpiresAt: Date.now() + ASSET_TOKEN_MARGIN_MS + 2 * TOKEN_CHECK_MS,
    });
    await vi.waitFor(() => expect(calls).toContain('open'));
    const asked = async () => (await socket.frames()).filter((frame) => frame['type'] === 'asset-token');

    await vi.advanceTimersByTimeAsync(TOKEN_CHECK_MS);
    expect(await asked()).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2 * TOKEN_CHECK_MS);
    await vi.advanceTimersByTimeAsync(TOKEN_CHECK_MS);
    expect(await asked()).toEqual([{ type: 'asset-token' }]);

    socket.deliver({ type: 'asset-token', assetToken: 'asset-2', expiresAt: Date.now() + 15 * 60_000 });
    await vi.waitFor(() => expect(connection.assetAccess?.token).toBe('asset-2'));
    await vi.advanceTimersByTimeAsync(TOKEN_CHECK_MS);
    expect(await asked()).toHaveLength(1);
  });

  it('holds the asset token already when it tells that the seat is in', async () => {
    let seen: unknown = 'not told';
    connection.callback.onOpen = () => {
      seen = connection.assetAccess;
      calls.push('open');
    };

    await enterRoom();

    expect(seen).toEqual({ roomKey: ROOM_KEY, token: 'asset-1' });
  });

  it('renews the asset token by the server’s clock, which this one may run behind', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const socket = await openRoom();
    socket.accept();
    // The server's clock is five minutes ahead: its token runs out sooner than this clock thinks.
    const ahead = 5 * 60_000;
    socket.deliver({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      peerId: connection.peerId,
      authorityPeerId: AUTHORITY_PEER_ID,
      role: 'pl',
      members: [],
      serverTime: Date.now() + ahead,
      assetToken: 'asset-1',
      assetTokenExpiresAt: Date.now() + ahead + ASSET_TOKEN_MARGIN_MS + TOKEN_CHECK_MS / 2,
    });
    await vi.waitFor(() => expect(calls).toContain('open'));

    await vi.advanceTimersByTimeAsync(TOKEN_CHECK_MS);

    const asked = (await socket.frames()).filter((frame) => frame['type'] === 'asset-token');
    expect(asked).toEqual([{ type: 'asset-token' }]);
  });

  it('takes on the role a fresh asset token comes with, and tells of a change only', async () => {
    const roles: string[] = [];
    connection.callback.onRoleChange = (role) => roles.push(role);
    const socket = await enterRoom();
    const token = (role?: string) => ({
      type: 'asset-token',
      assetToken: `asset-${role}`,
      expiresAt: Date.now() + 15 * 60_000,
      ...(role ? { role } : {}),
    });

    socket.deliver(token('pl'));
    socket.deliver(token());
    socket.deliver(token('gm'));

    await vi.waitFor(() => expect(connection.serverRole).toBe('gm'));
    expect(roles).toEqual(['gm']);
  });

  it('asks for a fresh asset token when one is turned down, and gives the access once it comes', async () => {
    const socket = await enterRoom();

    const refreshed = connection.refreshAssetAccess();
    const again = connection.refreshAssetAccess();
    await vi.waitFor(async () =>
      expect((await socket.frames()).filter((frame) => frame['type'] === 'asset-token')).toHaveLength(1)
    );
    socket.deliver({ type: 'asset-token', assetToken: 'asset-2', expiresAt: Date.now() + 15 * 60_000 });

    expect(await refreshed).toEqual({ roomKey: ROOM_KEY, token: 'asset-2' });
    expect(await again).toEqual({ roomKey: ROOM_KEY, token: 'asset-2' });
  });

  it('gives no fresh asset access outside a room, once it leaves, or when the server says nothing', async () => {
    expect(await connection.refreshAssetAccess()).toBeNull();

    await enterRoom();
    const leaving = connection.refreshAssetAccess();
    connection.close();
    expect(await leaving).toBeNull();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    connection = new ServerConnection();
    connection.configure({ backend: { url: BASE_URL } });
    connection.callback.onOpen = () => calls.push('open again');
    connection.open('my-user', 'Ab3', '月夜の卓', '', ROOM_KEY);
    await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(1));
    latest().accept();
    latest().deliver({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      peerId: connection.peerId,
      authorityPeerId: AUTHORITY_PEER_ID,
      role: 'pl',
      members: [],
      serverTime: Date.now(),
      assetToken: 'asset-1',
      assetTokenExpiresAt: Date.now() + 15 * 60_000,
    });
    await vi.waitFor(() => expect(calls).toContain('open again'));
    const unanswered = connection.refreshAssetAccess();
    await vi.advanceTimersByTimeAsync(ASSET_TOKEN_WAIT_MS);
    expect(await unanswered).toBeNull();
  });

  it('lists the server’s rooms for the lobby', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
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
      deletable: false,
    });
    expect(new Headers(fetch.mock.calls[0][1]?.headers).has('Authorization')).toBe(false);
  });

  it('leaves a deleted room at once, without trying again', async () => {
    const socket = await enterRoom();
    socket.deliver({ type: 'error', code: 'room-deleted', protocolVersion: PROTOCOL_VERSION });
    await settle();
    socket.close(4000, 'room-deleted');
    await vi.waitFor(() => expect(errors).toEqual([{ code: 'room-deleted' }]));

    expect(FakeWebSocket.instances.length).toBe(1);
  });

  describe('logged in', () => {
    let tokens: string[];
    let account: string;
    let replaceRejected: ReturnType<typeof vi.fn<(rejected: string) => Promise<string | null>>>;

    beforeEach(() => {
      tokens = ['token-1'];
      account = 'acct_me';
      replaceRejected = vi.fn(async (rejected: string) => {
        tokens = tokens.filter((token) => token !== rejected);
        return tokens[0] ?? null;
      });
      connection.useCredentials({
        credentials: async () => (tokens[0] ? { userId: account, accessToken: tokens[0] } : null),
        accessToken: async () => tokens[0] ?? null,
        replaceRejected,
      });
    });

    async function hello(socket: FakeWebSocket): Promise<Record<string, unknown>> {
      await vi.waitFor(async () => expect((await socket.frames()).length).toBeGreaterThan(0));
      return (await socket.frames())[0] as Record<string, unknown>;
    }

    it('takes the account’s seat and says hello with its token and the invitation', async () => {
      connection.useInvite('the-invite');
      const socket = await openRoom();
      socket.accept();

      expect(await hello(socket)).toEqual({
        type: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        peerId: connection.peerId,
        userId: 'acct_me',
        accessToken: 'token-1',
        invite: 'the-invite',
      });
      expect(connection.peer.userId).toBe('acct_me');
    });

    it('says hello with the token of an account whose user id lacks the account prefix', async () => {
      account = 'e0100553-8866-4924-8a4a-d4900ac59de5';
      const socket = await openRoom();
      socket.accept();

      expect(await hello(socket)).toMatchObject({ userId: account, accessToken: 'token-1' });
    });

    it('hands the server fresh tokens for an account whose user id lacks the account prefix', async () => {
      account = 'e0100553-8866-4924-8a4a-d4900ac59de5';
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const socket = await enterRoom();
      tokens = ['token-2'];

      await vi.advanceTimersByTimeAsync(TOKEN_CHECK_MS);
      vi.useRealTimers();

      await vi.waitFor(async () =>
        expect((await socket.frames()).at(-1)).toEqual({ type: 'auth', accessToken: 'token-2' })
      );
    });

    it('keeps the role the server gave, and leaves the invitation out once in', async () => {
      connection.useInvite('the-invite');
      const socket = await openRoom();
      socket.accept();
      socket.deliver({
        type: 'welcome',
        protocolVersion: PROTOCOL_VERSION,
        peerId: connection.peerId,
        authorityPeerId: AUTHORITY_PEER_ID,
        role: 'gm',
        members: [],
        serverTime: Date.now(),
        assetToken: 'asset-1',
        assetTokenExpiresAt: Date.now() + 15 * 60_000,
      });
      await vi.waitFor(() => expect(calls).toContain('open'));
      expect(connection.serverRole).toBe('gm');

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      socket.close(1006);
      vi.advanceTimersByTime(1000);
      vi.useRealTimers();
      const again = latest();
      again.accept();

      expect(await hello(again)).not.toHaveProperty('invite');
    });

    it('keeps the invitation of a seat let in as a guest, for when it comes back logged in', async () => {
      connection.useInvite('the-invite');
      const socket = await openRoom();
      socket.accept();
      socket.deliver({
        type: 'welcome',
        protocolVersion: PROTOCOL_VERSION,
        peerId: connection.peerId,
        authorityPeerId: AUTHORITY_PEER_ID,
        role: 'guest',
        members: [],
        serverTime: Date.now(),
        assetToken: 'asset-1',
        assetTokenExpiresAt: Date.now() + 15 * 60_000,
      });
      await vi.waitFor(() => expect(calls).toContain('open'));

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      socket.close(1006);
      vi.advanceTimersByTime(1000);
      vi.useRealTimers();
      const again = latest();
      again.accept();

      expect((await hello(again))['invite']).toBe('the-invite');
    });

    it('hands the server each fresh access token while in the room', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      const socket = await enterRoom();
      tokens = ['token-2'];

      await vi.advanceTimersByTimeAsync(TOKEN_CHECK_MS);
      await vi.advanceTimersByTimeAsync(TOKEN_CHECK_MS);
      vi.useRealTimers();

      await vi.waitFor(async () =>
        expect((await socket.frames()).at(-1)).toEqual({ type: 'auth', accessToken: 'token-2' })
      );
      expect((await socket.frames()).filter((frame) => frame['type'] === 'auth')).toHaveLength(1);
    });

    it('refreshes a token the server turned down and says hello once more with the new one', async () => {
      tokens = ['token-1', 'token-2'];
      const socket = await openRoom();
      socket.accept();
      await hello(socket);
      socket.deliver({ type: 'error', code: 'unauthorized', protocolVersion: PROTOCOL_VERSION });
      socket.close(4000, 'unauthorized');

      await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBe(2));
      const again = latest();
      again.accept();

      expect(replaceRejected).toHaveBeenCalledWith('token-1');
      expect((await hello(again))['accessToken']).toBe('token-2');
      expect(errors).toEqual([]);
    });

    it('gives up when the server turns the login down again', async () => {
      tokens = ['token-1', 'token-2'];
      const socket = await openRoom();
      socket.accept();
      await hello(socket);
      socket.deliver({ type: 'error', code: 'unauthorized', protocolVersion: PROTOCOL_VERSION });
      socket.close(4000, 'unauthorized');
      await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBe(2));
      const again = latest();
      again.accept();
      await hello(again);
      again.deliver({ type: 'error', code: 'unauthorized', protocolVersion: PROTOCOL_VERSION });
      again.close(4000, 'unauthorized');

      await vi.waitFor(() => expect(errors).toEqual([{ code: 'unauthorized' }]));
      expect(FakeWebSocket.instances.length).toBe(2);
    });

    it('ends the session rather than come back as somebody else after another login', async () => {
      const socket = await enterRoom();
      account = 'acct_someone-else';
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      socket.close(1006);
      vi.advanceTimersByTime(1000);
      vi.useRealTimers();
      latest().accept();

      await vi.waitFor(() => expect(errors).toEqual([{ code: 'unauthorized' }]));
      expect(latest().sent).toEqual([]);
    });

    it('creates a room with the access token', async () => {
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ roomKey: ROOM_KEY, roomId: 'Ab3' }), { status: 201 }));

      await connection.createRoom('月夜の卓', '');

      expect(new Headers(fetch.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer token-1');
    });

    it('lists the rooms with the access token, so that the server marks those the reader may delete', async () => {
      const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            rooms: [
              { roomKey: ROOM_KEY, roomId: 'Ab3', name: '月夜の卓', hasPassword: false, members: 0, deletable: true },
            ],
          })
        )
      );

      const rooms = await connection.listAllRooms();

      expect(new Headers(fetch.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer token-1');
      expect(rooms[0].deletable).toBe(true);
    });

    it('lists the rooms unmarked when the login cannot be refreshed just now', async () => {
      connection.useCredentials({
        credentials: async () => null,
        accessToken: () => Promise.reject(new Error('offline')),
        replaceRejected,
      });
      const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ rooms: [] })));

      expect(await connection.listAllRooms()).toEqual([]);
      expect(new Headers(fetch.mock.calls[0][1]?.headers).has('Authorization')).toBe(false);
    });

    it('deletes a room with the access token', async () => {
      const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

      await connection.deleteRoom(ROOM_KEY);

      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/v1/rooms/${ROOM_KEY}`);
      expect(init?.method).toBe('DELETE');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token-1');
    });

    it('passes on the server’s refusal to delete a room', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'not-game-master' }), { status: 403 })
      );

      await expect(connection.deleteRoom(ROOM_KEY)).rejects.toMatchObject({ status: 403, code: 'not-game-master' });
    });
  });

  it('never claims an account’s user id without its token', async () => {
    connection.open('acct_logged-out', 'Ab3', '月夜の卓', '', ROOM_KEY);
    await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));
    const socket = latest();
    socket.accept();
    await vi.waitFor(async () => expect((await socket.frames()).length).toBe(1));

    const hello = (await socket.frames())[0] as Record<string, unknown>;
    expect(hello['userId']).not.toMatch(/^acct_/);
    expect(hello).not.toHaveProperty('accessToken');
  });

  it('asks for an invitation and hands back the server’s answer', async () => {
    const socket = await enterRoom();

    const answer = connection.requestInvite('pl');
    await vi.waitFor(async () => expect((await socket.frames()).at(-1)).toEqual({ type: 'invite', role: 'pl' }));
    socket.deliver({ type: 'invite', role: 'pl', invite: 'signed', expiresAt: 1794592000000 });

    expect(await answer).toEqual({ type: 'invite', role: 'pl', invite: 'signed', expiresAt: 1794592000000 });
  });

  it('gives up on an invitation the server does not answer', async () => {
    await enterRoom();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const answer = connection.requestInvite('gm');
    vi.advanceTimersByTime(INVITE_TIMEOUT_MS);

    await expect(answer).rejects.toThrow('did not answer');
  });

  it('opens on standby without connecting to anything', async () => {
    connection.openStandby('my-user');

    await vi.waitFor(() => expect(calls).toEqual(['open']));
    expect(FakeWebSocket.instances.length).toBe(0);
    expect(connection.peer.isRoom).toBe(false);
  });
});
