import {
  LinkHeartbeat,
  PING_INTERVAL_MS,
  PONG_TIMEOUT_MS,
  SOCKET_OPEN,
  WELCOME_TIMEOUT_MS,
} from '@axe/core/network/server/link-heartbeat';
import { PING } from '@axe/core/network/server/server-protocol';

describe('LinkHeartbeat', () => {
  let current: WebSocket | null;
  let welcomed: boolean;
  let lost: { code: number; reason: string }[];
  let heartbeat: LinkHeartbeat;

  function openSocket(): WebSocket & { sent: unknown[] } {
    const sent: unknown[] = [];
    const socket = { readyState: SOCKET_OPEN, sent, send: (data: unknown) => sent.push(data) };
    return socket as unknown as WebSocket & { sent: unknown[] };
  }

  beforeEach(() => {
    vi.useFakeTimers();
    current = null;
    welcomed = false;
    lost = [];
    heartbeat = new LinkHeartbeat({
      isCurrent: (socket) => socket === current,
      welcomed: () => welcomed,
      lost: (_socket, code, reason) => lost.push({ code, reason }),
    });
  });

  afterEach(() => {
    heartbeat.stop();
    vi.useRealTimers();
  });

  it('takes the link as lost when the seat is not let in in time', () => {
    current = openSocket();
    heartbeat.start(current);

    vi.advanceTimersByTime(WELCOME_TIMEOUT_MS - 1);
    expect(lost).not.toContainEqual({ code: 4002, reason: 'no welcome' });
    vi.advanceTimersByTime(1);
    expect(lost).toContainEqual({ code: 4002, reason: 'no welcome' });
  });

  it('waits no longer once the seat is let in', () => {
    current = openSocket();
    heartbeat.start(current);
    welcomed = true;
    heartbeat.heard();

    vi.advanceTimersByTime(WELCOME_TIMEOUT_MS);

    expect(lost).not.toContainEqual({ code: 4002, reason: 'no welcome' });
  });

  it('asks every while whether the server is there, and takes silence as a lost link', () => {
    welcomed = true;
    const socket = openSocket();
    current = socket;
    heartbeat.start(socket);

    vi.advanceTimersByTime(PING_INTERVAL_MS);
    expect(socket.sent).toEqual([PING]);
    vi.advanceTimersByTime(PONG_TIMEOUT_MS - 1);
    expect(lost).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(lost).toEqual([{ code: 4001, reason: 'no answer to ping' }]);
  });

  it('keeps the link while anything is heard from the server', () => {
    welcomed = true;
    const socket = openSocket();
    current = socket;
    heartbeat.start(socket);

    for (let ping = 0; ping < 3; ping++) {
      vi.advanceTimersByTime(PING_INTERVAL_MS);
      heartbeat.heard();
    }

    expect(socket.sent).toEqual([PING, PING, PING]);
    expect(lost).toEqual([]);
  });

  it('leaves a link alone once it is no longer the connection’s, or not open', () => {
    welcomed = true;
    const socket = openSocket();
    current = socket;
    heartbeat.start(socket);
    vi.advanceTimersByTime(PING_INTERVAL_MS);
    current = null;

    vi.advanceTimersByTime(PONG_TIMEOUT_MS + PING_INTERVAL_MS);

    expect(socket.sent).toEqual([PING]);
    expect(lost).toEqual([]);
  });

  it('watches nothing once stopped', () => {
    const socket = openSocket();
    current = socket;
    heartbeat.start(socket);
    heartbeat.stop();

    vi.advanceTimersByTime(WELCOME_TIMEOUT_MS + PING_INTERVAL_MS);

    expect(socket.sent).toEqual([]);
    expect(lost).toEqual([]);
  });
});
