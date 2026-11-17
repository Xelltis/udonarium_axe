import { AgentBridgeClient, type AgentLinkState, type AgentSocket } from '@axe/core/agent/agent-bridge-client';
import { type AgentOutcome, AgentToolError } from '@axe/core/agent/agent-error';
import { AGENT_PROTOCOL_VERSION, type AgentSeat } from '@axe/core/agent/agent-protocol';
import { agentToolsDigest } from '@axe/core/agent/agent-tools';

/** A socket that keeps what the client sends, and lets a spec play the bridge. */
class FakeSocket implements AgentSocket {
  readyState = 0;
  readonly sent: Record<string, unknown>[] = [];
  closedWith: string | null = null;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(_code?: number, reason?: string): void {
    this.closedWith = reason ?? '';
    this.readyState = 3;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  hear(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  drop(): void {
    this.readyState = 3;
    this.onclose?.({});
  }
}

const SEAT: AgentSeat = { name: 'AI GM', role: 'gm', scope: 'write' };
const HELLO = {
  type: 'hello',
  protocol: AGENT_PROTOCOL_VERSION,
  tools: agentToolsDigest(),
  bridge: '1.80.0',
  mode: 'mcp',
  models: [],
};
const CONNECTED: AgentLinkState = { kind: 'connected', bridge: '1.80.0', mode: 'mcp', models: [] };

/** Lets the promises queued so far settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('AgentBridgeClient', () => {
  let socket: FakeSocket;
  let states: AgentLinkState[];
  let run: (tool: string, args: Readonly<Record<string, unknown>>, signal: AbortSignal) => Promise<AgentOutcome>;
  let client: AgentBridgeClient;
  let seat: AgentSeat;

  beforeEach(() => {
    states = [];
    seat = SEAT;
    run = async (tool, args) => ({ ok: true, value: { tool, args } });
    client = new AgentBridgeClient({
      port: 47610,
      app: '1.80.0',
      seat: () => seat,
      run: (tool, args, signal) => run(tool, args, signal),
      onState: (state) => states.push(state),
      createSocket: (url) => (socket = new FakeSocket(url)),
    });
  });

  function connectAndGreet(): void {
    client.connect();
    socket.open();
    socket.hear(HELLO);
  }

  it('connects to the bridge on this computer, and answers its greeting with whose seat this is', () => {
    connectAndGreet();

    expect(socket.url).toBe('ws://127.0.0.1:47610/axe');
    expect(socket.sent).toEqual([
      { type: 'welcome', protocol: AGENT_PROTOCOL_VERSION, tools: agentToolsDigest(), app: '1.80.0', seat: SEAT },
    ]);
    expect(states).toEqual([{ kind: 'connecting' }, CONNECTED]);
  });

  it('runs each call it is handed and answers it by its id', async () => {
    connectAndGreet();
    socket.hear({ type: 'call', id: 'c1', tool: 'move_piece', args: { col: 2 } });
    await settle();

    expect(socket.sent[1]).toEqual({
      type: 'result',
      id: 'c1',
      ok: true,
      value: { tool: 'move_piece', args: { col: 2 } },
    });
  });

  it('answers a refusal or a failure as it was, and anything thrown as a failure', async () => {
    connectAndGreet();
    run = async () => ({ ok: false, error: { code: 'not_allowed', message: 'read only' } });
    socket.hear({ type: 'call', id: 'c1', tool: 'send_chat', args: {} });
    await settle();
    run = async () => {
      throw new AgentToolError('not_found', 'no such piece');
    };
    socket.hear({ type: 'call', id: 'c2', tool: 'move_piece', args: {} });
    await settle();
    run = async () => {
      throw new Error('broke');
    };
    socket.hear({ type: 'call', id: 'c3', tool: 'move_piece', args: {} });
    await settle();

    expect(socket.sent.slice(1)).toEqual([
      { type: 'result', id: 'c1', ok: false, error: { code: 'not_allowed', message: 'read only' } },
      { type: 'result', id: 'c2', ok: false, error: { code: 'not_found', message: 'no such piece' } },
      { type: 'result', id: 'c3', ok: false, error: { code: 'failed', message: 'broke' } },
    ]);
  });

  it('gives a call up when the bridge says the AI did, and answers it no more', async () => {
    connectAndGreet();
    let aborted = false;
    let finish: () => void = () => undefined;
    run = (_tool, _args, signal) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => (aborted = true));
        finish = () => resolve({ ok: true, value: null });
      });
    socket.hear({ type: 'call', id: 'c1', tool: 'wait_for_events', args: {} });
    socket.hear({ type: 'cancel', id: 'c1' });
    finish();
    await settle();

    expect(aborted).toBe(true);
    expect(socket.sent).toHaveLength(1);
  });

  it('tells the bridge the seat anew while connected', () => {
    client.tellSeat();
    connectAndGreet();
    seat = { ...SEAT, scope: 'read' };
    client.tellSeat();

    expect(socket.sent[1]).toEqual({ type: 'seat', seat: { ...SEAT, scope: 'read' } });
  });

  it('hears a game-master bridge out, and tells it what the panel asks only while connected', () => {
    const heard: unknown[] = [];
    client = new AgentBridgeClient({
      port: 47610,
      app: '1.80.0',
      seat: () => seat,
      run: (tool, args, signal) => run(tool, args, signal),
      onState: (state) => states.push(state),
      onGm: (message) => heard.push(message),
      createSocket: (url) => (socket = new FakeSocket(url)),
    });
    expect(client.tellGm({ type: 'gm.stop' })).toBe(false);

    client.connect();
    socket.open();
    socket.hear({ ...HELLO, mode: 'gm', models: [{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }] });
    expect(states.at(-1)).toEqual({
      kind: 'connected',
      bridge: '1.80.0',
      mode: 'gm',
      models: [{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }],
    });

    socket.hear({ type: 'gm.notes', notes: '一行目' });
    socket.hear({ type: 'gm.said', text: '酒場の場面へ', at: 5 });
    expect(heard).toEqual([
      { type: 'gm.notes', notes: '一行目' },
      { type: 'gm.said', text: '酒場の場面へ', at: 5 },
    ]);

    expect(client.tellGm({ type: 'gm.nudge', direction: '' })).toBe(true);
    expect(socket.sent.at(-1)).toEqual({ type: 'gm.nudge', direction: '' });
  });

  it('turns away a bridge whose tools are not this tab’s, and hears a bridge turn it away', () => {
    client.connect();
    socket.open();
    socket.hear({ ...HELLO, tools: '00000000' });

    expect(socket.sent).toEqual([]);
    expect(socket.closedWith).toBe('protocol');
    expect(states.at(-1)).toEqual({ kind: 'refused', reason: 'protocol', bridge: '1.80.0' });

    client.connect();
    socket.open();
    socket.hear({
      type: 'refuse',
      reason: 'busy',
      protocol: AGENT_PROTOCOL_VERSION,
      tools: agentToolsDigest(),
      bridge: '1.80.0',
    });
    socket.drop();
    expect(states.at(-1)).toEqual({ kind: 'refused', reason: 'busy', bridge: '1.80.0' });
  });

  it('turns away a bridge whose greeting it cannot read, as one of another release may send', () => {
    client.connect();
    socket.open();
    socket.hear({ type: 'hello', protocol: 1, bridge: '1.79.0' });

    expect(states.at(-1)).toEqual({ kind: 'refused', reason: 'protocol', bridge: '1.79.0' });
    expect(socket.closedWith).toBe('protocol');
  });

  it('lets pass anything else it cannot read', () => {
    connectAndGreet();
    socket.onmessage?.({ data: 'not json' });
    socket.hear({ type: 'gossip' });

    expect(states.at(-1)).toEqual(CONNECTED);
  });

  it('says no bridge answered, or that the one connected went away, giving up what it was running', async () => {
    client.connect();
    socket.drop();
    expect(states.at(-1)).toEqual({ kind: 'lost', unreachable: true });

    connectAndGreet();
    let aborted = false;
    run = (_tool, _args, signal) => new Promise(() => signal.addEventListener('abort', () => (aborted = true)));
    socket.hear({ type: 'call', id: 'c1', tool: 'wait_for_events', args: {} });
    socket.drop();
    expect(states.at(-1)).toEqual({ kind: 'lost', unreachable: false });
    expect(aborted).toBe(true);
  });

  it('lets go of the bridge when closed, and says so', () => {
    connectAndGreet();
    const first = socket;
    client.close();

    expect(first.closedWith).toBe('closed');
    expect(states.at(-1)).toEqual({ kind: 'idle' });
    expect(client.current).toEqual({ kind: 'idle' });
  });

  it('says no bridge answered where a socket cannot even be made', () => {
    const failing = new AgentBridgeClient({
      port: 47610,
      app: '1',
      seat: () => SEAT,
      run,
      onState: (state) => states.push(state),
      createSocket: () => {
        throw new Error('blocked');
      },
    });
    failing.connect();
    expect(states.at(-1)).toEqual({ kind: 'lost', unreachable: true });
  });
});
