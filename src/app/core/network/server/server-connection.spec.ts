import { IPeerContext } from '@axe/core/network/peer-context';
import { IDLE_WARNING_MS } from '@axe/core/network/server/idle-watch';
import { PING_INTERVAL_MS, PONG_TIMEOUT_MS, WELCOME_TIMEOUT_MS } from '@axe/core/network/server/link-heartbeat';
import { MAX_HELD_BROADCASTS } from '@axe/core/network/server/outbound-events';
import { pageActivity } from '@axe/core/network/server/page-activity';
import {
  PACE_WINDOW_MS,
  SEND_BUDGET_EVENTS,
  SEND_BUDGET_FRAMES,
  SEND_WINDOW_MS,
} from '@axe/core/network/server/send-pacer';
import {
  INVITE_TIMEOUT_MS,
  MISSING_MEMBER_GRACE_MS,
  SEND_GATHER_MS,
  ServerConnection,
} from '@axe/core/network/server/server-connection';
import { NO_BACKEND, SERVER_UNREACHABLE } from '@axe/core/network/server/server-errors';
import { decodeFrame, MAX_FRAME_BYTES } from '@axe/core/network/server/server-frames';
import {
  ACTIVE_REPORT_SECONDS,
  AUTHORITY_PEER_ID,
  EventContext,
  IDLE_SECONDS,
  Member,
  PROTOCOL_VERSION,
  ServerMessage,
} from '@axe/core/network/server/server-protocol';
import { ServerRoomApiError } from '@axe/core/network/server/server-room-api';
import { ASSET_TOKEN_MARGIN_MS, ASSET_TOKEN_WAIT_MS, TOKEN_CHECK_MS } from '@axe/core/network/server/token-renewal';
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

/**
 * How long a spec waits for all it sent to be written. Each frame of a big load is encoded on its
 * way out, which a busy machine can take seconds over; the wait ends as soon as all is written.
 */
const DRAINED = { timeout: 20_000 };

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

  /**
   * The server answers every ping, so that the fake clock can run on with the link kept: a test
   * that lets send windows go by is otherwise cut off for want of an answer, once a busy machine
   * has it look one window more than the sends needed.
   */
  function answerPings(socket: FakeWebSocket): FakeWebSocket {
    const send = socket.send.bind(socket);
    socket.send = (data) => {
      send(data);
      if (data === 'ping') setTimeout(() => socket.onmessage?.({ data: 'pong' }), 0);
    };
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
      idleMs: expect.any(Number),
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

  it('gathers what is sent within a moment into one frame per destination, each in order', async () => {
    const socket = await enterRoom([OTHER]);

    connection.send([event('A')]);
    connection.send([event('B')]);
    connection.send([event('C')], OTHER.peerId);
    await vi.waitFor(async () => expect((await socket.frames()).length).toBe(3));

    const sent = (await socket.frames()).slice(1);
    expect(sent).toContainEqual({ type: 'send', events: [event('A'), event('B')] });
    expect(sent).toContainEqual({ type: 'send', to: OTHER.peerId, events: [event('C')] });
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

  describe('asked back by the server', () => {
    const welcomeOn = (socket: FakeWebSocket, extra: Record<string, unknown> = {}) => {
      socket.accept();
      socket.deliver({
        type: 'welcome',
        protocolVersion: PROTOCOL_VERSION,
        peerId: connection.peerId,
        authorityPeerId: AUTHORITY_PEER_ID,
        role: 'pl',
        members: [OTHER],
        serverTime: Date.now(),
        assetToken: 'asset-1',
        assetTokenExpiresAt: Date.now() + 15 * 60_000,
        ...extra,
      });
    };

    it.each(['rotate', 'moved'])('comes straight back on a new link for %s, telling nobody it went', async (reason) => {
      const socket = await enterRoom([OTHER]);
      const before = calls.length;

      socket.close(1012, reason);

      expect(FakeWebSocket.instances.length).toBe(2);
      expect(calls.slice(before)).toEqual([]);
      expect(connection.peerIds).toEqual([OTHER.peerId]);
      welcomeOn(latest());
      await vi.waitFor(() => expect(calls.slice(before)).toEqual(['reconnect resumed', 'connect authority']));
      expect(connection.peerIds).toEqual([OTHER.peerId]);
    });

    it('shows no member leaving that is let back in a while after the seat, as by a server that changed hands', async () => {
      const socket = await enterRoom([OTHER]);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      socket.close(1012, 'moved');
      welcomeOn(latest(), { members: [] });
      await vi.waitFor(() => expect(calls).toContain('reconnect resumed'));

      latest().deliver({ type: 'join', member: OTHER });
      await vi.advanceTimersByTimeAsync(MISSING_MEMBER_GRACE_MS);

      expect(calls).not.toContain(`disconnect ${OTHER.peerId}`);
      expect(connection.peerIds).toEqual([OTHER.peerId]);
    });

    it('takes a member still missing from the room a while after getting back in as gone', async () => {
      const socket = await enterRoom([OTHER]);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      socket.close(1012, 'moved');
      welcomeOn(latest(), { members: [] });
      await vi.waitFor(() => expect(calls).toContain('reconnect resumed'));
      expect(calls).not.toContain(`disconnect ${OTHER.peerId}`);

      await vi.advanceTimersByTimeAsync(MISSING_MEMBER_GRACE_MS);

      expect(calls).toContain(`disconnect ${OTHER.peerId}`);
      expect(connection.peerIds).toEqual([]);
    });

    it('tells of the drop after all when the new link is asked back too before letting the seat in', async () => {
      const socket = await enterRoom([OTHER]);
      const before = calls.length;
      socket.close(1012, 'rotate');

      latest().close(1012, 'moved');

      expect(calls.slice(before)).toEqual(['disconnect authority', `disconnect ${OTHER.peerId}`, 'reconnect retrying']);
    });

    it('tells of a role changed while the link was down, once back on the new one', async () => {
      connection.callback.onRoleChange = (role) => calls.push(`role ${role}`);
      const socket = await enterRoom([OTHER]);
      socket.close(1012, 'rotate');
      welcomeOn(latest());
      await vi.waitFor(() => expect(calls).toContain('reconnect resumed'));
      expect(calls).not.toContain('role pl');

      latest().close(1012, 'rotate');
      welcomeOn(latest(), { role: 'gm' });

      await vi.waitFor(() => expect(calls).toContain('role gm'));
    });

    it('tries again after the usual wait when asked back before its first welcome, rather than giving up', async () => {
      const socket = await openRoom();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      socket.accept();

      socket.close(1012, 'moved');

      expect(errors).toEqual([]);
      expect(FakeWebSocket.instances.length).toBe(1);
      vi.advanceTimersByTime(1000);
      expect(FakeWebSocket.instances.length).toBe(2);
      welcomeOn(latest());
      await vi.waitFor(() => expect(calls).toEqual(['open', 'connect authority', `connect ${OTHER.peerId}`]));
    });

    it('comes back from the cache as after any return, once a return the server asked for was cut short', async () => {
      const socket = await enterRoom([OTHER]);
      socket.close(1012, 'rotate');
      connection.leaveImmediately();
      calls = [];

      await connection.rejoinAfterLeave();
      welcomeOn(latest());

      await vi.waitFor(() => expect(calls).toContain('reconnect recovered'));
      expect(calls).not.toContain('reconnect resumed');
    });

    it('tells of the drop after all when the new link fails, and gets back in as after any', async () => {
      const socket = await enterRoom([OTHER]);
      const before = calls.length;
      socket.close(1012, 'moved');

      latest().close(1006);

      expect(calls.slice(before)).toEqual(['disconnect authority', `disconnect ${OTHER.peerId}`, 'reconnect retrying']);
      expect(connection.peerIds).toEqual([]);
    });

    it('takes a restart for any other reason as a dropped link', async () => {
      const socket = await enterRoom([OTHER]);
      const before = calls.length;

      socket.close(1012, 'going away');

      expect(calls.slice(before)).toEqual(['disconnect authority', `disconnect ${OTHER.peerId}`, 'reconnect retrying']);
    });

    it('hands on how the server takes big pictures and sounds with the access to them', async () => {
      const socket = await openRoom();
      welcomeOn(socket, { assetUpload: { maxPutBytes: 4_000_000, directUpload: true } });
      await vi.waitFor(() => expect(calls).toContain('open'));

      expect(connection.assetAccess).toEqual({
        roomKey: ROOM_KEY,
        token: 'asset-1',
        upload: { maxPutBytes: 4_000_000, directUpload: true },
        clockOffset: expect.any(Number),
      });
      socket.close(1012, 'rotate');
      welcomeOn(latest());
      await vi.waitFor(() =>
        expect(connection.assetAccess).toEqual({ roomKey: ROOM_KEY, token: 'asset-1', clockOffset: expect.any(Number) })
      );
    });
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

  describe('a page left alone', () => {
    const MINUTE = 60_000;
    let idle: string[];

    beforeEach(() => {
      idle = [];
      connection.callback.onIdle = (state) => idle.push(state);
    });

    const fakeClock = () =>
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const actives = async (socket: FakeWebSocket) =>
      (await socket.frames()).filter((frame) => frame['type'] === 'active').length;
    const welcomeOn = (socket: FakeWebSocket) =>
      socket.deliver({
        type: 'welcome',
        protocolVersion: PROTOCOL_VERSION,
        peerId: connection.peerId,
        authorityPeerId: AUTHORITY_PEER_ID,
        role: 'pl',
        members: [],
        serverTime: Date.now(),
        assetToken: 'asset-1',
        assetTokenExpiresAt: Date.now() + 15 * MINUTE,
      });

    it('says in the hello how long the page has gone unused', async () => {
      fakeClock();
      pageActivity.noteInput();
      vi.advanceTimersByTime(20 * MINUTE);
      const socket = await openRoom();
      socket.accept();

      await vi.waitFor(async () => expect((await socket.frames()).length).toBe(1));
      const { idleMs } = (await socket.frames())[0] as { idleMs: number };
      expect(idleMs).toBeGreaterThanOrEqual(20 * MINUTE);
      expect(idleMs).toBeLessThan(21 * MINUTE);
    });

    it('says active when the page is used once the server last heard so a while ago, and no sooner', async () => {
      fakeClock();
      pageActivity.noteInput();
      const socket = answerPings(await enterRoom());

      vi.advanceTimersByTime(MINUTE);
      pageActivity.noteInput();
      await vi.advanceTimersByTimeAsync(0);
      expect(await actives(socket)).toBe(0);

      vi.advanceTimersByTime(ACTIVE_REPORT_SECONDS * 1000);
      await vi.advanceTimersByTimeAsync(0);
      expect(await actives(socket)).toBe(0);
      pageActivity.noteInput();
      pageActivity.noteInput();
      await vi.waitFor(async () => expect(await actives(socket)).toBe(1));
    });

    it('warns before the seat would be let out, and takes the warning back once the page is used', async () => {
      fakeClock();
      pageActivity.noteInput();
      const socket = answerPings(await enterRoom());
      const warnIn = pageActivity.lastInputAt + IDLE_SECONDS * 1000 - IDLE_WARNING_MS - Date.now();

      vi.advanceTimersByTime(warnIn - 1);
      expect(idle).toEqual([]);
      vi.advanceTimersByTime(1);
      expect(idle).toEqual(['soon']);

      pageActivity.noteInput();
      expect(idle).toEqual(['soon', 'back']);
      await vi.waitFor(async () => expect(await actives(socket)).toBe(1));
    });

    it('stays out once let out as idle, and goes back in on the same peer id only when asked', async () => {
      const socket = await enterRoom();
      fakeClock();
      socket.deliver({ type: 'error', code: 'idle', protocolVersion: PROTOCOL_VERSION });
      await vi.advanceTimersByTimeAsync(0);
      socket.close(4000, 'idle');

      expect(idle).toEqual(['left']);
      await vi.advanceTimersByTimeAsync(60 * MINUTE);
      expect(FakeWebSocket.instances.length).toBe(1);
      expect(errors).toEqual([]);
      vi.useRealTimers();

      connection.comeBackFromIdle();
      const again = latest();
      expect(FakeWebSocket.instances.length).toBe(2);
      again.accept();
      await vi.waitFor(async () => expect((await again.frames()).length).toBe(1));
      expect((await again.frames())[0]).toMatchObject({ type: 'hello', peerId: connection.peerId });
      welcomeOn(again);
      await vi.waitFor(() => expect(calls).toContain('reconnect recovered'));
    });

    it('stays out when the hello itself is turned away as idle', async () => {
      const socket = await openRoom();
      socket.accept();
      socket.deliver({ type: 'error', code: 'idle', protocolVersion: PROTOCOL_VERSION });
      await settle();
      socket.close(4000, 'idle');

      expect(idle).toEqual(['left']);
      expect(errors).toEqual([]);
    });

    it('goes back in only when it was let out so', () => {
      connection.comeBackFromIdle();

      expect(FakeWebSocket.instances.length).toBe(0);
    });
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

  it('takes a connection the server never lets in as lost, though something answers its pings', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const socket = await openRoom();
    socket.accept();

    for (let waited = 0; waited < WELCOME_TIMEOUT_MS; waited += PONG_TIMEOUT_MS / 2) {
      vi.advanceTimersByTime(PONG_TIMEOUT_MS / 2);
      socket.onmessage?.({ data: 'pong' });
    }

    expect(socket.readyState).toBe(3);
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

  /** Lets the seat back in over the newest socket. */
  function welcomeBack(socket: FakeWebSocket): void {
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
      assetTokenExpiresAt: Date.now() + 15 * 60_000,
    });
  }

  it('keeps a role change asked for while getting back in, and sends it once back; a roll it leaves to the dice bot', async () => {
    const socket = await enterRoom();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    socket.close(1006);
    const roleRequest = event('ROLE_REQUEST', { peerId: OTHER.peerId, role: 'gm' });
    connection.send([event('ROLL_REQUEST', { command: '2d6' }), roleRequest, event('CHAT')], AUTHORITY_PEER_ID);
    connection.send([event('CURSOR_MOVE')]);
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();

    const again = latest();
    welcomeBack(again);

    await vi.waitFor(async () => expect((await again.frames()).length).toBe(2));
    expect((await again.frames())[1]).toEqual({ type: 'send', to: AUTHORITY_PEER_ID, events: [roleRequest] });
  });

  it('keeps a deletion, a change and a word on what comes back while getting back in, for everybody once back', async () => {
    const socket = await enterRoom();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    socket.close(1006);
    const deletion = event('DELETE_GAME_OBJECT', { aliasName: 'chat-tab', identifier: 'tab-1' });
    const comingBack = event('FORGET_DELETED_OBJECTS', { identifiers: ['tab-2'] });
    connection.send([deletion, event('UPDATE_GAME_OBJECT'), event('CURSOR_MOVE'), comingBack]);
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();

    const again = latest();
    welcomeBack(again);

    await vi.waitFor(async () => expect((await again.frames()).length).toBe(2));
    const [, sent] = (await again.frames()) as { type: string; to?: string; events: unknown[] }[];
    expect(sent.type).toBe('send');
    expect(sent.to).toBeUndefined();
    expect(sent.events).toEqual([deletion, event('UPDATE_GAME_OBJECT'), comingBack]);
  });

  it('keeps a deck split while getting back in whole: its cards move to the new deck before the old one goes', async () => {
    const socket = await enterRoom();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    socket.close(1006);
    const change = (identifier: string, parent: string, majorVersion: number) =>
      event('UPDATE_GAME_OBJECT', {
        aliasName: 'card',
        identifier,
        majorVersion,
        syncData: { parentIdentifier: parent },
      });
    const newDeck = change('deck-2', 'table', 1);
    const moved = change('card-1', 'deck-2', 3);
    const deletion = event('DELETE_GAME_OBJECT', { aliasName: 'card-stack', identifier: 'deck-1' });

    connection.send([newDeck, change('card-1', 'deck-1', 2)]);
    connection.send([moved, deletion]);

    expect(await sentOnceBack()).toEqual([newDeck, moved, deletion]);
  });

  it('keeps a card moved before its old deck goes ahead of the deletion, though the card is touched again after it', async () => {
    const socket = await enterRoom();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    socket.close(1006);
    const change = (identifier: string, parent: string, majorVersion: number) =>
      event('UPDATE_GAME_OBJECT', {
        aliasName: 'card',
        identifier,
        majorVersion,
        syncData: { parentIdentifier: parent },
      });
    const moved = change('card-1', 'deck-2', 2);
    const deletion = event('DELETE_GAME_OBJECT', { aliasName: 'card-stack', identifier: 'deck-1' });
    const shuffled = change('card-1', 'deck-2', 3);

    connection.send([moved, deletion]);
    connection.send([change('card-1', 'deck-2', 3)]);
    connection.send([shuffled]);

    expect(await sentOnceBack()).toEqual([moved, deletion, shuffled]);
  });

  it('keeps a deletion while getting back in though changes held already would fill the limit', async () => {
    const socket = await enterRoom();
    socket.close(1006);
    const deletion = event('DELETE_GAME_OBJECT', { aliasName: 'card', identifier: 'gone' });

    connection.send(
      Array.from({ length: MAX_HELD_BROADCASTS }, (_, i) =>
        event('UPDATE_GAME_OBJECT', { aliasName: 'card', identifier: `card-${i % 10}`, majorVersion: i })
      )
    );
    connection.send([deletion]);

    const held = (connection as unknown as { held: { events: EventContext[] }[] }).held.flatMap(
      (batch) => batch.events
    );
    expect(held).toHaveLength(11);
    expect(held.at(-1)).toEqual(deletion);
  });

  it('keeps every deletion of a long tab deleted while getting back in, and what comes after it', async () => {
    const socket = await enterRoom();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    socket.close(1006);
    const deletions = Array.from({ length: 100 }, (_, i) =>
      event('DELETE_GAME_OBJECT', { aliasName: 'chat', identifier: `line-${i}` })
    );
    const comingBack = event('FORGET_DELETED_OBJECTS', { identifiers: ['tab-1'] });
    const roleRequest = event('ROLE_REQUEST', { peerId: OTHER.peerId, role: 'gm' });
    connection.send(deletions);
    connection.send([comingBack]);
    connection.send([roleRequest], AUTHORITY_PEER_ID);
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();

    const again = latest();
    welcomeBack(again);

    await vi.waitFor(async () => expect((await again.frames()).length).toBeGreaterThan(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const sent = ((await again.frames()) as { type: string; events?: unknown[] }[]).flatMap((frame) =>
      frame.type === 'send' ? (frame.events ?? []) : []
    );
    expect(sent).toEqual(expect.arrayContaining([...deletions, comingBack, roleRequest]));
    expect(sent).toHaveLength(102);
  });

  it('keeps a role change still gathering to go out when the link drops', async () => {
    const socket = await enterRoom();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const roleRequest = event('ROLE_REQUEST', { peerId: OTHER.peerId, role: 'gm' });
    connection.send([roleRequest, event('CHAT')], AUTHORITY_PEER_ID);
    socket.close(1006);
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();

    const again = latest();
    welcomeBack(again);

    await vi.waitFor(async () => expect((await again.frames()).length).toBe(2));
    expect((await again.frames())[1]).toEqual({ type: 'send', to: AUTHORITY_PEER_ID, events: [roleRequest] });
    expect(await socket.frames()).not.toContainEqual(expect.objectContaining({ type: 'send' }));
  });

  /** Sends a deletion and an update to everybody, and waits until they are written to the link. */
  async function writeDeletion(socket: FakeWebSocket, identifier: string): Promise<EventContext> {
    const deletion = event('DELETE_GAME_OBJECT', { aliasName: 'card', identifier });
    const before = (await socket.frames()).length;
    connection.send([deletion, event('UPDATE_GAME_OBJECT')]);
    await vi.advanceTimersByTimeAsync(SEND_GATHER_MS);
    await vi.waitFor(async () => expect((await socket.frames()).length).toBe(before + 1));
    return deletion;
  }

  /** What the seat sends to everybody over the newest link once let back in. */
  async function sentOnceBack(): Promise<unknown[]> {
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    const again = latest();
    welcomeBack(again);
    await vi.waitFor(async () => expect((await again.frames()).length).toBeGreaterThan(0));
    await new Promise((resolve) => setTimeout(resolve, SEND_GATHER_MS + 50));
    return eventsWritten(again);
  }

  /**
   * Lets the windows go by until all that was sent is written. A window passes whole at each look,
   * since a frame written late on a busy machine is counted from the faked time it went out at, and
   * the window after it opens only that much later.
   */
  async function drained(): Promise<void> {
    await vi.waitFor(async () => {
      if (connection.sendsPending) await vi.advanceTimersByTimeAsync(PACE_WINDOW_MS);
      expect(connection.sendsPending).toBe(false);
    }, DRAINED);
  }

  /** The events written to a socket for everyone, in order. */
  async function eventsWritten(socket: FakeWebSocket): Promise<unknown[]> {
    return ((await socket.frames()) as { type: string; to?: string; events?: unknown[] }[]).flatMap((frame) =>
      frame.type === 'send' && frame.to === undefined ? (frame.events ?? []) : []
    );
  }

  it('sends no deletion again that was written to a link that dropped, as it may have been brought back since', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const socket = await enterRoom();
    await writeDeletion(socket, 'card-1');

    socket.close(1006);

    expect(await sentOnceBack()).toEqual([]);
  });

  it('keeps a deletion on its way out ahead of a word that it comes back sent after it, when the link drops', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    await enterRoom();
    const deletion = event('DELETE_GAME_OBJECT', { aliasName: 'chat-tab', identifier: 'tab-1' });
    const comingBack = event('FORGET_DELETED_OBJECTS', { identifiers: ['tab-1'] });
    connection.send([deletion]);
    vi.advanceTimersByTime(SEND_GATHER_MS);
    connection.send([comingBack]);

    latest().close(1006);

    expect(await sentOnceBack()).toEqual([deletion, comingBack]);
  });

  it('keeps a deletion still gathering to go out when the page is left for the cache', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    await enterRoom();
    const deletion = event('DELETE_GAME_OBJECT', { aliasName: 'card', identifier: 'card-1' });
    connection.send([deletion, event('CURSOR_MOVE')]);

    connection.leaveImmediately();
    await connection.rejoinAfterLeave();

    expect(await sentOnceBack()).toEqual([deletion]);
  });

  it('counts what it holds while getting back in as sends pending, and its link as down once the page is cached', async () => {
    const socket = await enterRoom();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    socket.close(1006);
    expect(connection.sendsPending).toBe(false);

    connection.send([event('DELETE_GAME_OBJECT', { aliasName: 'card', identifier: 'card-1' })]);
    expect(connection.sendsPending).toBe(true);

    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    welcomeBack(latest());
    await vi.waitFor(() => expect(connection.authorityOpen).toBe(true));
    connection.leaveImmediately();
    expect(connection.authorityOpen).toBe(false);
  });

  it('keeps a deletion held while getting back in through a page left for the cache', async () => {
    const socket = await enterRoom();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    socket.close(1006);
    const deletion = event('DELETE_GAME_OBJECT', { aliasName: 'card', identifier: 'card-1' });
    connection.send([deletion]);

    connection.leaveImmediately();
    await connection.rejoinAfterLeave();

    expect(await sentOnceBack()).toEqual([deletion]);
  });

  it('lets go of the server for a page left for the cache, and comes back into the room when it is shown again', async () => {
    const socket = await enterRoom();
    calls = [];

    connection.leaveImmediately();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(socket.readyState).toBe(3);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(calls).toEqual([]);

    await connection.rejoinAfterLeave();
    expect(calls).toEqual(['disconnect authority']);
    const again = latest();
    welcomeBack(again);

    await vi.waitFor(() => expect(calls).toContain('reconnect recovered'));
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect((await again.frames())[0]).toMatchObject({ type: 'hello', peerId: connection.peerId });
  });

  it('spreads many deletions over the server’s windows rather than going past its limit and being cut off', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const socket = await enterRoom();
    const deletions = Array.from({ length: SEND_BUDGET_EVENTS * 2 }, (_, i) =>
      event('DELETE_GAME_OBJECT', { aliasName: 'chat', identifier: `line-${i}` })
    );
    const written = async () =>
      ((await socket.frames()) as { type: string; events?: unknown[] }[]).reduce(
        (count, frame) => count + (frame.type === 'send' ? (frame.events?.length ?? 0) : 0),
        0
      );

    connection.send(deletions);
    await vi.advanceTimersByTimeAsync(SEND_GATHER_MS);
    await vi.waitFor(async () => expect(await written()).toBe(SEND_BUDGET_EVENTS));
    // The server's window may start late, as its first frame is taken in, so the next waits past it.
    await vi.advanceTimersByTimeAsync(SEND_WINDOW_MS);
    expect(await written()).toBe(SEND_BUDGET_EVENTS);

    await vi.advanceTimersByTimeAsync(PACE_WINDOW_MS - SEND_WINDOW_MS);
    await vi.waitFor(async () => expect(await written()).toBe(SEND_BUDGET_EVENTS * 2));
  });

  it('sends no deletion still to go of what the server hands back on refusing a deletion, as the lines of a tab it kept', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const socket = answerPings(await enterRoom());
    const tab = event('DELETE_GAME_OBJECT', { aliasName: 'chat-tab', identifier: 'tab-1' });
    const deletions = Array.from({ length: SEND_BUDGET_EVENTS * 2 - 1 }, (_, i) =>
      event('DELETE_GAME_OBJECT', { aliasName: 'chat', identifier: `line-${i}` })
    );
    connection.send([tab, ...deletions]);
    await vi.advanceTimersByTimeAsync(SEND_GATHER_MS);
    await vi.waitFor(async () => expect((await socket.frames()).length).toBeGreaterThan(1));
    const kept = `line-${SEND_BUDGET_EVENTS + 5}`;
    const handedBack = (identifier: string, parentIdentifier: string) => ({
      eventName: 'AUTHORITATIVE_OBJECT',
      data: { identifier, syncData: { parentIdentifier } },
      sendFrom: AUTHORITY_PEER_ID,
    });

    socket.deliver({
      type: 'data',
      from: AUTHORITY_PEER_ID,
      events: [handedBack('tab-1', 'chat-tab-list'), handedBack(kept, 'tab-1')],
    });
    await vi.waitFor(() => expect(received.length).toBe(1));
    await drained();

    const sent = ((await socket.frames()) as { type: string; events?: EventContext[] }[]).flatMap((frame) =>
      frame.type === 'send' ? (frame.events ?? []) : []
    );
    expect(sent).toHaveLength(SEND_BUDGET_EVENTS * 2 - 1);
    expect(sent.map((sentEvent) => (sentEvent.data as { identifier: string }).identifier)).not.toContain(kept);
  });

  it('still sends a deletion of what it brought back after deleting it, when the server hands that back for a change', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const socket = answerPings(await enterRoom());
    const line = (identifier: string) => ({ aliasName: 'chat', identifier, majorVersion: 2, syncData: {} });
    connection.send([
      event('DELETE_GAME_OBJECT', { aliasName: 'chat', identifier: 'rolled' }),
      event('FORGET_DELETED_OBJECTS', { identifiers: ['rolled'] }),
      event('UPDATE_GAME_OBJECT', line('rolled')),
    ]);
    await vi.advanceTimersByTimeAsync(SEND_GATHER_MS);
    await vi.waitFor(async () => expect((await socket.frames()).length).toBeGreaterThan(1));
    const clearing = Array.from({ length: SEND_BUDGET_EVENTS * 2 }, (_, i) =>
      event('DELETE_GAME_OBJECT', {
        aliasName: 'chat',
        identifier: i === SEND_BUDGET_EVENTS + 5 ? 'rolled' : `line-${i}`,
      })
    );
    connection.send(clearing);
    await vi.advanceTimersByTimeAsync(SEND_GATHER_MS);

    socket.deliver({
      type: 'data',
      from: AUTHORITY_PEER_ID,
      events: [{ eventName: 'AUTHORITATIVE_OBJECT', data: line('rolled'), sendFrom: AUTHORITY_PEER_ID }],
    });
    await vi.waitFor(() => expect(received.length).toBe(1));
    await drained();

    const deleted = ((await socket.frames()) as { type: string; events?: EventContext[] }[])
      .flatMap((frame) => (frame.type === 'send' ? (frame.events ?? []) : []))
      .filter((sentEvent) => sentEvent.eventName === 'DELETE_GAME_OBJECT')
      .map((sentEvent) => (sentEvent.data as { identifier: string }).identifier);
    expect(deleted.filter((identifier) => identifier === 'rolled')).toHaveLength(2);
  });

  it('still sends a deletion of what the server hands back for a change it turned down, the deletion being no part of it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const socket = answerPings(await enterRoom());
    const deletions = Array.from({ length: SEND_BUDGET_EVENTS * 2 }, (_, i) =>
      event('DELETE_GAME_OBJECT', { aliasName: 'part', identifier: `part-${i}` })
    );
    connection.send(deletions);
    await vi.advanceTimersByTimeAsync(SEND_GATHER_MS);
    await vi.waitFor(async () => expect((await socket.frames()).length).toBeGreaterThan(1));
    const die = `part-${SEND_BUDGET_EVENTS + 5}`;

    socket.deliver({
      type: 'data',
      from: AUTHORITY_PEER_ID,
      events: [{ eventName: 'AUTHORITATIVE_OBJECT', data: { identifier: die }, sendFrom: AUTHORITY_PEER_ID }],
    });
    await vi.waitFor(() => expect(received.length).toBe(1));
    await drained();

    const sent = ((await socket.frames()) as { type: string; events?: EventContext[] }[]).flatMap((frame) =>
      frame.type === 'send' ? (frame.events ?? []) : []
    );
    expect(sent.map((sentEvent) => (sentEvent.data as { identifier: string }).identifier)).toContain(die);
  });

  it('still sends a deletion of what comes back for a change together with what it deleted already', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const socket = answerPings(await enterRoom());
    const deletions = Array.from({ length: SEND_BUDGET_EVENTS * 2 }, (_, i) =>
      event('DELETE_GAME_OBJECT', { aliasName: 'chat', identifier: `line-${i}` })
    );
    connection.send(deletions);
    await vi.advanceTimersByTimeAsync(SEND_GATHER_MS);
    await vi.waitFor(async () => expect((await socket.frames()).length).toBeGreaterThan(1));
    const handedBack = (identifier: string) => ({
      eventName: 'AUTHORITATIVE_OBJECT',
      data: { identifier, syncData: { parentIdentifier: 'tab-1' } },
      sendFrom: AUTHORITY_PEER_ID,
    });
    const later = `line-${SEND_BUDGET_EVENTS + 5}`;

    socket.deliver({ type: 'data', from: AUTHORITY_PEER_ID, events: [handedBack('line-5'), handedBack(later)] });
    await vi.waitFor(() => expect(received.length).toBe(1));
    await drained();

    const sent = ((await socket.frames()) as { type: string; events?: EventContext[] }[]).flatMap((frame) =>
      frame.type === 'send' ? (frame.events ?? []) : []
    );
    expect(sent.map((sentEvent) => (sentEvent.data as { identifier: string }).identifier)).toContain(later);
  });

  it('takes back nothing the server hands back whose deletion is yet to go out, the deletion going after', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const socket = answerPings(await enterRoom());
    const deletions = Array.from({ length: SEND_BUDGET_EVENTS * 2 }, (_, i) =>
      event('DELETE_GAME_OBJECT', { aliasName: 'chat', identifier: `line-${i}` })
    );
    connection.send(deletions);
    await vi.advanceTimersByTimeAsync(SEND_GATHER_MS);
    await vi.waitFor(async () => expect((await socket.frames()).length).toBeGreaterThan(1));
    const handedBack = (identifier: string) => ({
      eventName: 'AUTHORITATIVE_OBJECT',
      data: { identifier, syncData: { parentIdentifier: 'tab-1' } },
      sendFrom: AUTHORITY_PEER_ID,
    });
    const later = `line-${SEND_BUDGET_EVENTS + 5}`;
    const other = { eventName: 'UPDATE_GAME_OBJECT', data: { identifier: 'piece' }, sendFrom: AUTHORITY_PEER_ID };

    socket.deliver({ type: 'data', from: AUTHORITY_PEER_ID, events: [handedBack(later), other] });
    await vi.waitFor(() => expect(received.length).toBe(1));

    expect(received[0].events).toEqual([other]);
    await drained();
    const sent = ((await socket.frames()) as { type: string; events?: EventContext[] }[]).flatMap((frame) =>
      frame.type === 'send' ? (frame.events ?? []) : []
    );
    expect(sent.map((sentEvent) => (sentEvent.data as { identifier: string }).identifier)).toContain(later);
  });

  it('keeps two steps inside the server’s window should the first come in late', () => {
    expect(SEND_BUDGET_EVENTS * 2).toBeLessThanOrEqual(20_000);
    expect(SEND_BUDGET_FRAMES * 2).toBeLessThanOrEqual(2_000);
  });

  it('writes its own messages while a big load waits for room, and the events behind it in order', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const socket = await enterRoom();
    const deletions = Array.from({ length: SEND_BUDGET_EVENTS * 2 - 1 }, (_, i) =>
      event('DELETE_GAME_OBJECT', { aliasName: 'chat', identifier: `line-${i}` })
    );
    connection.send(deletions);
    await vi.advanceTimersByTimeAsync(SEND_GATHER_MS);
    await vi.waitFor(async () => expect((await socket.frames()).length).toBeGreaterThan(1));
    const roleRequest = event('ROLE_REQUEST', { peerId: OTHER.peerId, role: 'gm' });

    connection.send([roleRequest], AUTHORITY_PEER_ID);
    void connection.requestInvite('pl').catch(() => undefined);
    await vi.advanceTimersByTimeAsync(SEND_GATHER_MS);

    await vi.waitFor(async () =>
      expect(await socket.frames()).toContainEqual(expect.objectContaining({ type: 'invite' }))
    );
    expect(await socket.frames()).not.toContainEqual(expect.objectContaining({ to: AUTHORITY_PEER_ID }));
    await vi.advanceTimersByTimeAsync(PACE_WINDOW_MS);
    await vi.waitFor(async () => {
      const frames = (await socket.frames()) as { type: string; to?: string; events?: EventContext[] }[];
      const sends = frames.filter((frame) => frame.type === 'send');
      expect(sends.at(-1)).toEqual({ type: 'send', to: AUTHORITY_PEER_ID, events: [roleRequest] });
      expect(sends.flatMap((frame) => frame.events ?? [])).toHaveLength(SEND_BUDGET_EVENTS * 2);
    });
  });

  it('holds every deletion a dropped link cut off, past the limit on what is held while getting back in', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const socket = await enterRoom();
    const deletions = Array.from({ length: 40_000 }, (_, i) =>
      event('DELETE_GAME_OBJECT', { aliasName: 'chat', identifier: `line-${i}` })
    );
    connection.send(deletions);
    await vi.advanceTimersByTimeAsync(SEND_GATHER_MS);
    await vi.waitFor(() => expect(connection.sendsPending).toBe(true));
    await vi.waitFor(async () => expect((await socket.frames()).length).toBeGreaterThan(1));

    socket.close(1006);

    const held = (connection as unknown as { held: { events: unknown[] }[] }).held;
    expect(held.reduce((count, batch) => count + batch.events.length, 0)).toBe(40_000 - SEND_BUDGET_EVENTS);
  });

  it('keeps a word that something comes back while getting back in, past the limit the deletions filled', async () => {
    const socket = await enterRoom();
    socket.close(1006);
    const comingBack = event('FORGET_DELETED_OBJECTS', { identifiers: ['tab-1'] });

    connection.send(
      Array.from({ length: MAX_HELD_BROADCASTS }, (_, i) =>
        event('DELETE_GAME_OBJECT', { aliasName: 'chat', identifier: `line-${i}` })
      )
    );
    connection.send([event('DELETE_GAME_OBJECT', { aliasName: 'chat', identifier: 'over' }), comingBack]);

    const held = (connection as unknown as { held: { events: unknown[] }[] }).held.flatMap((batch) => batch.events);
    expect(held).toHaveLength(MAX_HELD_BROADCASTS + 1);
    expect(held.at(-1)).toEqual(comingBack);
  });

  it('keeps a deletion ahead of a word that it comes back, when the link is closing as it would be written', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const socket = await enterRoom();
    const deletion = event('DELETE_GAME_OBJECT', { aliasName: 'chat-tab', identifier: 'tab-1' });
    const comingBack = event('FORGET_DELETED_OBJECTS', { identifiers: ['tab-1'] });
    connection.send([deletion]);
    vi.advanceTimersByTime(SEND_GATHER_MS);
    socket.readyState = 2;
    connection.send([comingBack]);
    await vi.advanceTimersByTimeAsync(0);

    socket.close(1006);

    expect(await sentOnceBack()).toEqual([deletion, comingBack]);
  });

  it('says it has sends pending while they are on their way out, and none once they have gone or only gather', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const socket = answerPings(await enterRoom());
    const deletions = Array.from({ length: SEND_BUDGET_EVENTS * 2 }, (_, i) =>
      event('DELETE_GAME_OBJECT', { aliasName: 'chat', identifier: `line-${i}` })
    );

    connection.send(deletions);
    expect(connection.sendsPending).toBe(false);
    vi.advanceTimersByTime(SEND_GATHER_MS);
    expect(connection.sendsPending).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    await vi.waitFor(async () => expect((await socket.frames()).length).toBeGreaterThan(1));
    expect(connection.sendsPending).toBe(true);

    await drained();
  });

  it('stops waiting to write when the link goes, keeping the deletions for the next', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    const socket = await enterRoom();
    const deletions = Array.from({ length: SEND_BUDGET_EVENTS * 2 }, (_, i) =>
      event('DELETE_GAME_OBJECT', { aliasName: 'chat', identifier: `line-${i}` })
    );
    connection.send(deletions);
    await vi.advanceTimersByTimeAsync(SEND_GATHER_MS);
    await vi.waitFor(async () => expect(await eventsWritten(socket)).toHaveLength(SEND_BUDGET_EVENTS));

    socket.close(1006);
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    const again = latest();
    welcomeBack(again);

    await vi.waitFor(async () => expect(await eventsWritten(again)).toHaveLength(SEND_BUDGET_EVENTS), {
      timeout: PACE_WINDOW_MS / 2,
    });
    expect((await eventsWritten(again))[0]).toEqual(deletions[SEND_BUDGET_EVENTS]);
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

  it('knows how far the server’s clock runs ahead only once it has let the seat in', async () => {
    expect(connection.serverClockOffset).toBeUndefined();

    await enterRoom();

    expect(connection.serverClockOffset).toEqual(expect.any(Number));
  });

  it('says the link to the server is up once let in, and down once it drops', async () => {
    expect(connection.authorityOpen).toBe(false);

    const socket = await enterRoom();
    expect(connection.authorityOpen).toBe(true);

    socket.close(1006);
    await vi.waitFor(() => expect(connection.authorityOpen).toBe(false));
  });

  it('reaches the room’s pictures and sounds with the welcome’s token while in the room, and not outside', async () => {
    expect(connection.assetAccess).toBeNull();

    const socket = await enterRoom();

    expect(connection.assetAccess).toEqual({ roomKey: ROOM_KEY, token: 'asset-1', clockOffset: expect.any(Number) });
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

  it('reaches nothing over HTTP, and asks for no token, with the empty one a Worker without login hands out', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
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
      assetToken: '',
      assetTokenExpiresAt: 0,
    });
    await vi.waitFor(() => expect(calls).toContain('open'));

    expect(connection.assetAccess).toBeNull();
    await vi.advanceTimersByTimeAsync(3 * TOKEN_CHECK_MS);
    expect((await socket.frames()).filter((frame) => frame['type'] === 'asset-token')).toEqual([]);
  });

  it('holds the asset token already when it tells that the seat is in', async () => {
    let seen: unknown = 'not told';
    connection.callback.onOpen = () => {
      seen = connection.assetAccess;
      calls.push('open');
    };

    await enterRoom();

    expect(seen).toEqual({ roomKey: ROOM_KEY, token: 'asset-1', clockOffset: expect.any(Number) });
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

  it('knows the role the room keeps for it, from the welcome and from each asset token that says', async () => {
    const socket = await openRoom();
    socket.accept();
    socket.deliver({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      peerId: connection.peerId,
      authorityPeerId: AUTHORITY_PEER_ID,
      role: 'guest',
      keptRole: 'pl',
      members: [],
      serverTime: Date.now(),
      assetToken: 'asset-1',
      assetTokenExpiresAt: Date.now() + 15 * 60_000,
    });
    await vi.waitFor(() => expect(connection.keptRole).toBe('pl'));
    let keptWhenTold: string | undefined;
    connection.callback.onRoleChange = () => (keptWhenTold = connection.keptRole);

    socket.deliver({
      type: 'asset-token',
      assetToken: 'asset-2',
      expiresAt: Date.now() + 60_000,
      role: 'gm',
      keptRole: 'gm',
    });
    await vi.waitFor(() => expect(connection.serverRole).toBe('gm'));
    socket.deliver({ type: 'asset-token', assetToken: 'asset-3', expiresAt: Date.now() + 60_000 });

    expect(keptWhenTold).toBe('gm');
    await vi.waitFor(() => expect(connection.keptRole).toBe('gm'));
  });

  it('tells of the kept role changed though the role stays, as a GM makes a seat that watches a guest', async () => {
    const socket = await openRoom();
    socket.accept();
    socket.deliver({
      type: 'welcome',
      protocolVersion: PROTOCOL_VERSION,
      peerId: connection.peerId,
      authorityPeerId: AUTHORITY_PEER_ID,
      role: 'guest',
      keptRole: 'pl',
      members: [],
      serverTime: Date.now(),
      assetToken: 'asset-1',
      assetTokenExpiresAt: Date.now() + 15 * 60_000,
    });
    await vi.waitFor(() => expect(connection.keptRole).toBe('pl'));
    const told: (string | undefined)[] = [];
    connection.callback.onRoleChange = (role) => told.push(`${role}/${connection.keptRole}`);

    socket.deliver({
      type: 'asset-token',
      assetToken: 'asset-2',
      expiresAt: Date.now() + 60_000,
      role: 'guest',
      keptRole: 'guest',
    });

    await vi.waitFor(() => expect(told).toEqual(['guest/guest']));
  });

  it('knows of no kept role where the server tells of none, as for a seat not logged in', async () => {
    await enterRoom();

    expect(connection.keptRole).toBeUndefined();
  });

  it('asks for a fresh asset token when one is turned down, and gives the access once it comes', async () => {
    const socket = await enterRoom();

    const refreshed = connection.refreshAssetAccess();
    const again = connection.refreshAssetAccess();
    await vi.waitFor(async () =>
      expect((await socket.frames()).filter((frame) => frame['type'] === 'asset-token')).toHaveLength(1)
    );
    socket.deliver({ type: 'asset-token', assetToken: 'asset-2', expiresAt: Date.now() + 15 * 60_000 });

    expect(await refreshed).toEqual({ roomKey: ROOM_KEY, token: 'asset-2', clockOffset: expect.any(Number) });
    expect(await again).toEqual({ roomKey: ROOM_KEY, token: 'asset-2', clockOffset: expect.any(Number) });
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

  it('leaves the room at once, without trying again, when the operator banned the seat', async () => {
    const socket = await enterRoom();
    socket.deliver({ type: 'error', code: 'banned', protocolVersion: PROTOCOL_VERSION });
    await settle();
    socket.close(4000, 'banned');
    await vi.waitFor(() => expect(errors).toEqual([{ code: 'banned' }]));

    expect(FakeWebSocket.instances.length).toBe(1);
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
        isAccountUserId: (userId) => userId === account,
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
        idleMs: expect.any(Number),
      });
      expect(connection.peer.userId).toBe('acct_me');
    });

    it('says hello with the token of an account whose user id lacks the account prefix', async () => {
      account = 'e0100553-8866-4924-8a4a-d4900ac59de5';
      const socket = await openRoom();
      socket.accept();

      expect(await hello(socket)).toMatchObject({ userId: account, accessToken: 'token-1' });
    });

    it('never claims, logged out, the user id of an account that lacks the account prefix', async () => {
      account = 'e0100553-8866-4924-8a4a-d4900ac59de5';
      tokens = [];
      connection.open(account, 'Ab3', '月夜の卓', '', ROOM_KEY);
      await vi.waitFor(() => expect(FakeWebSocket.instances.length).toBe(1));
      const socket = latest();
      socket.accept();

      const said = await hello(socket);
      expect(said['userId']).not.toBe(account);
      expect(said).not.toHaveProperty('accessToken');
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

    it('leaves the invitation out once in watching, as an account the room keeps a role for', async () => {
      connection.useInvite('the-invite');
      const socket = await openRoom();
      socket.accept();
      socket.deliver({
        type: 'welcome',
        protocolVersion: PROTOCOL_VERSION,
        peerId: connection.peerId,
        authorityPeerId: AUTHORITY_PEER_ID,
        role: 'guest',
        keptRole: 'pl',
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

      expect(await hello(again)).not.toHaveProperty('invite');
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

    it('gets back in, rather than giving up, when the login cannot be refreshed just now', async () => {
      const socket = await enterRoom();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      replaceRejected.mockRejectedValueOnce(new Error('offline'));

      socket.deliver({ type: 'error', code: 'unauthorized', protocolVersion: PROTOCOL_VERSION });
      socket.close(4000, 'unauthorized');
      await vi.advanceTimersByTimeAsync(0);

      expect(errors).toEqual([]);
      expect(calls).toContain('reconnect retrying');
      await vi.advanceTimersByTimeAsync(30_000);
      expect(FakeWebSocket.instances.length).toBe(2);
    });

    it('ends the attempt with the server out of reach when the login cannot be refreshed before it got in', async () => {
      tokens = ['token-1', 'token-2'];
      replaceRejected.mockRejectedValueOnce(new Error('offline'));
      const socket = await openRoom();
      socket.accept();
      await hello(socket);

      socket.deliver({ type: 'error', code: 'unauthorized', protocolVersion: PROTOCOL_VERSION });
      socket.close(4000, 'unauthorized');

      await vi.waitFor(() => expect(errors).toEqual([{ code: SERVER_UNREACHABLE }]));
      expect(FakeWebSocket.instances.length).toBe(1);
    });

    it('ends the session with the server out of reach once it has no tries left to get back in', async () => {
      const socket = await enterRoom();
      replaceRejected.mockRejectedValueOnce(new Error('offline'));
      const scheduler = (connection as unknown as { reconnectScheduler: { schedule: () => number | null } })
        .reconnectScheduler;
      vi.spyOn(scheduler, 'schedule').mockReturnValue(null);

      socket.deliver({ type: 'error', code: 'unauthorized', protocolVersion: PROTOCOL_VERSION });
      socket.close(4000, 'unauthorized');

      await vi.waitFor(() => expect(errors).toEqual([{ code: SERVER_UNREACHABLE }]));
      expect(calls).not.toContain('reconnect retrying');
    });

    it('stops for the ban, rather than getting back in, when a refresh after a refusal is turned away for one', async () => {
      const socket = await enterRoom();
      replaceRejected.mockRejectedValueOnce(new ServerRoomApiError(403, 'banned'));

      socket.deliver({ type: 'error', code: 'unauthorized', protocolVersion: PROTOCOL_VERSION });
      socket.close(4000, 'unauthorized');

      await vi.waitFor(() => expect(errors).toEqual([{ code: 'banned' }]));
      expect(calls).not.toContain('reconnect retrying');
      expect(FakeWebSocket.instances.length).toBe(1);
    });

    it('opens nothing and names the ban when the login cannot be refreshed for one as it opens', async () => {
      connection.useCredentials({
        credentials: () => Promise.reject(new ServerRoomApiError(403, 'banned')),
        accessToken: async () => null,
        replaceRejected,
        isAccountUserId: (userId) => userId === account,
      });

      connection.open('my-user', 'Ab3', '月夜の卓', '', ROOM_KEY);

      await vi.waitFor(() => expect(errors).toEqual([{ code: 'banned' }]));
      expect(FakeWebSocket.instances).toEqual([]);
    });

    it('stops for the ban, rather than getting back in, when the login cannot be refreshed for one as it says hello', async () => {
      const socket = await enterRoom();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      connection.useCredentials({
        credentials: () => Promise.reject(new ServerRoomApiError(403, 'banned')),
        accessToken: async () => 'token-1',
        replaceRejected,
        isAccountUserId: (userId) => userId === account,
      });
      socket.close(1006);
      await vi.advanceTimersByTimeAsync(1000);
      latest().accept();
      await vi.advanceTimersByTimeAsync(0);

      expect(errors).toEqual([{ code: 'banned' }]);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(FakeWebSocket.instances.length).toBe(2);
    });

    it('opens nothing, the server being out of reach, when the login cannot be refreshed as it opens', async () => {
      connection.useCredentials({
        credentials: () => Promise.reject(new Error('offline')),
        accessToken: async () => null,
        replaceRejected,
        isAccountUserId: (userId) => userId === account,
      });

      connection.open('my-user', 'Ab3', '月夜の卓', '', ROOM_KEY);

      await vi.waitFor(() => expect(errors).toEqual([{ code: SERVER_UNREACHABLE }]));
      expect(FakeWebSocket.instances).toEqual([]);
    });

    it('closes the socket and gets back in when the login cannot be refreshed as it says hello', async () => {
      const socket = await enterRoom();
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
      let offline = true;
      connection.useCredentials({
        credentials: async () => {
          if (offline) throw new Error('offline');
          return { userId: account, accessToken: 'token-1' };
        },
        accessToken: async () => 'token-1',
        replaceRejected,
        isAccountUserId: (userId) => userId === account,
      });
      socket.close(1006);
      await vi.advanceTimersByTimeAsync(1000);
      const again = latest();
      const closed = vi.spyOn(again, 'close');
      again.accept();
      await vi.advanceTimersByTimeAsync(0);

      expect(closed).toHaveBeenCalledWith(4001, 'the login could not be refreshed');
      expect(errors).toEqual([]);
      offline = false;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(FakeWebSocket.instances.length).toBeGreaterThan(2);
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
        isAccountUserId: () => false,
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

    it('creates and deletes a room again with a fresh token when the server turns down one that looked good', async () => {
      tokens = ['token-1', 'token-2'];
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'login-required' }), { status: 401 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ roomKey: ROOM_KEY, roomId: 'Ab3' }), { status: 201 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'login-required' }), { status: 401 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'login-required' }), { status: 401 }));

      await connection.createRoom('月夜の卓', '');
      await expect(connection.deleteRoom(ROOM_KEY)).rejects.toMatchObject({ status: 401 });

      const authorizations = fetch.mock.calls.map(([, init]) => new Headers(init?.headers).get('Authorization'));
      expect(authorizations).toEqual(['Bearer token-1', 'Bearer token-2', 'Bearer token-2']);
      expect(replaceRejected.mock.calls).toEqual([['token-1'], ['token-2']]);
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
