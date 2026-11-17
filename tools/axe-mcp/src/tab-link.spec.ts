import { AGENT_PROTOCOL_VERSION, type AgentSeat } from '@axe/core/agent/agent-protocol';
import { agentToolsDigest } from '@axe/core/agent/agent-tools';

import { NOT_CONNECTED, TabLink } from './tab-link';
import { TestTab, until } from './test-tab';

const SEAT: AgentSeat = { name: 'AI GM', role: 'gm', scope: 'write' };

describe('TabLink', () => {
  let link: TabLink;
  let port: number;
  let logged: string[];
  const tabs: TestTab[] = [];

  function tab(origin?: string, host?: string): TestTab {
    const made = new TestTab(port, origin, host);
    tabs.push(made);
    return made;
  }

  beforeEach(async () => {
    logged = [];
    link = new TabLink({
      port: 0,
      origins: ['http://localhost:4200'],
      bridge: '1.80.0',
      log: (line) => logged.push(line),
    });
    port = await link.listen();
  });

  afterEach(async () => {
    for (const made of tabs.splice(0)) made.close();
    await link.close();
  });

  it('greets a tab, hears whose seat it is, and hands it calls to answer', async () => {
    const seen: (string | null)[] = [];
    link.onChange((connected) => seen.push(connected?.seat.name ?? null));
    const axe = tab();
    axe.answer = (tool, args) => ({ tool, args });
    await axe.welcome(SEAT);
    await until(() => link.current !== null);

    expect(axe.heard[0]).toEqual({
      type: 'hello',
      protocol: AGENT_PROTOCOL_VERSION,
      tools: agentToolsDigest(),
      bridge: '1.80.0',
      mode: 'mcp',
      models: [],
    });
    expect(link.current).toEqual({ app: '1.80.0', seat: SEAT });
    expect(await link.call('move_piece', { col: 2 }, 1000)).toEqual({
      ok: true,
      value: { tool: 'move_piece', args: { col: 2 } },
    });

    axe.close();
    await until(() => link.current === null);
    expect(seen).toEqual(['AI GM', null]);
  });

  it('hears a seat change its name or what it lets the AI do', async () => {
    const axe = tab();
    await axe.welcome(SEAT);
    await until(() => link.current !== null);
    axe.socket.send(JSON.stringify({ type: 'seat', seat: { ...SEAT, scope: 'read' } }));
    await until(() => link.current?.seat.scope === 'read');
  });

  it('passes a tab’s refusal on to the AI', async () => {
    const axe = tab();
    axe.answer = () => undefined;
    axe.socket.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'call') {
        axe.socket.send(
          JSON.stringify({
            type: 'result',
            id: message.id,
            ok: false,
            error: { code: 'not_allowed', message: 'read only' },
          })
        );
      }
    });
    await axe.welcome(SEAT);
    await until(() => link.current !== null);

    expect(await link.call('send_chat', { text: 'hi' }, 1000)).toEqual({
      ok: false,
      error: { code: 'not_allowed', message: 'read only' },
    });
  });

  it('tells the AI no tab is connected, and gives up a call the tab does not answer in time', async () => {
    expect(await link.call('get_room', {}, 1000)).toEqual({
      ok: false,
      error: { code: 'not_connected', message: NOT_CONNECTED },
    });

    const axe = tab();
    axe.answer = () => undefined;
    await axe.welcome(SEAT);
    await until(() => link.current !== null);

    expect(await link.call('get_room', {}, 50)).toEqual({
      ok: false,
      error: { code: 'timeout', message: 'get_room took too long to answer.' },
    });
    await until(() => axe.heard.some((message) => (message as { type?: string })?.type === 'cancel'));
  });

  it('tells the tab when the AI gives up a call', async () => {
    const axe = tab();
    axe.answer = () => undefined;
    await axe.welcome(SEAT);
    await until(() => link.current !== null);
    const abort = new AbortController();

    const outcome = link.call('wait_for_events', {}, 10_000, abort.signal);
    await until(() => axe.heard.some((message) => (message as { type?: string })?.type === 'call'));
    abort.abort();

    expect(await outcome).toMatchObject({ ok: false, error: { code: 'failed' } });
    await until(() => axe.heard.some((message) => (message as { type?: string })?.type === 'cancel'));
  });

  it('waits a moment for a tab that is on its way, rather than turning the AI away at once', async () => {
    await link.close();
    link = new TabLink({
      port: 0,
      origins: ['http://localhost:4200'],
      bridge: '1.80.0',
      log: () => undefined,
      tabGraceMs: 3000,
    });
    port = await link.listen();

    const outcome = link.call('get_room', {}, 1000);
    const axe = tab();
    axe.answer = () => ({ room: true });
    await axe.welcome(SEAT);

    expect(await outcome).toEqual({ ok: true, value: { room: true } });
  });

  it('hands the tab nothing for a call the AI gave up before it went out', async () => {
    const axe = tab();
    await axe.welcome(SEAT);
    await until(() => link.current !== null);

    expect(await link.call('move_piece', { col: 1 }, 1000, AbortSignal.abort())).toMatchObject({
      ok: false,
      error: { code: 'failed', message: 'move_piece was cancelled.' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(axe.heard.filter((message) => (message as { type?: string })?.type === 'call')).toEqual([]);
  });

  it('gives up the calls a tab was answering when it goes away', async () => {
    const axe = tab();
    axe.answer = () => undefined;
    await axe.welcome(SEAT);
    await until(() => link.current !== null);

    const outcome = link.call('get_room', {}, 10_000);
    await until(() => axe.heard.length > 1);
    axe.close();

    expect(await outcome).toMatchObject({ ok: false, error: { code: 'not_connected' } });
  });

  it('turns away a second tab while one is connected', async () => {
    const first = tab();
    await first.welcome(SEAT);
    await until(() => link.current !== null);

    const second = tab();
    expect(await second.closed).toEqual({ code: 4001, reason: 'busy' });
    expect(second.heard).toEqual([
      { type: 'refuse', reason: 'busy', protocol: AGENT_PROTOCOL_VERSION, tools: agentToolsDigest(), bridge: '1.80.0' },
    ]);
    expect(link.current?.seat).toEqual(SEAT);
  });

  it('turns away a tab whose tools are not the bridge’s', async () => {
    const axe = tab();
    await axe.welcome(SEAT, AGENT_PROTOCOL_VERSION, '00000000');

    expect(await axe.closed).toEqual({ code: 4002, reason: 'protocol' });
    expect(link.current).toBeNull();
  });

  it('turns away a tab speaking another version of the link', async () => {
    const axe = tab();
    await axe.welcome(SEAT, AGENT_PROTOCOL_VERSION + 1);

    expect(await axe.closed).toEqual({ code: 4002, reason: 'protocol' });
    expect(link.current).toBeNull();
    expect(logged.some((line) => line.includes('Use the bridge of the same release as Axe'))).toBe(true);
  });

  it('turns away a page it does not trust, and a socket that came by another host name', async () => {
    const stranger = tab('https://evil.example');
    expect((await stranger.closed).code).not.toBe(1000);
    const rebound = tab('http://localhost:4200', `attacker.example:${port}`);
    expect((await rebound.closed).code).not.toBe(1000);

    expect(link.current).toBeNull();
    expect(logged.some((line) => line.includes('https://evil.example'))).toBe(true);
    expect(logged.some((line) => line.includes('attacker.example'))).toBe(true);
  });

  it('tells the AI the port is taken by another program, instead of stopping', async () => {
    const second = new TabLink({
      port,
      origins: [],
      bridge: '1.80.0',
      log: (line) => logged.push(line),
      tabGraceMs: 0,
    });
    await second.listen();

    const outcome = await second.call('get_room', {}, 1000);
    expect(outcome).toMatchObject({ ok: false, error: { code: 'not_connected' } });
    expect(!outcome.ok && outcome.error.message).toContain(`port ${port}`);
    await second.close();
  });

  it('as a game master, greets a tab with the models it runs, and passes what each side tells the other', async () => {
    await link.close();
    link = new TabLink({
      port: 0,
      origins: ['http://localhost:4200'],
      bridge: '1.80.0',
      log: () => undefined,
      mode: 'gm',
      models: [{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }],
    });
    port = await link.listen();
    const told: unknown[] = [];
    link.onGm((message) => told.push(message));
    expect(link.tellGm({ type: 'gm.notes', notes: 'まだ誰もいない' })).toBe(false);

    const axe = tab();
    await axe.welcome(SEAT);
    await until(() => link.current !== null);
    expect(axe.heard[0]).toMatchObject({ mode: 'gm', models: [{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }] });

    axe.say({ type: 'gm.nudge', direction: '酒場へ' });
    await until(() => told.length > 0);
    expect(told).toEqual([{ type: 'gm.nudge', direction: '酒場へ' }]);

    expect(link.tellGm({ type: 'gm.notes', notes: '一行目' })).toBe(true);
    await until(() => axe.heard.length > 1);
    expect(axe.heard[1]).toEqual({ type: 'gm.notes', notes: '一行目' });
  });

  it('lets go of a tab that stops answering the heartbeat', async () => {
    await link.close();
    link = new TabLink({
      port: 0,
      origins: ['http://localhost:4200'],
      bridge: '1.80.0',
      log: () => undefined,
      heartbeatMs: 30,
    });
    port = await link.listen();
    // A tab that never answers a ping, as one on a laptop gone to sleep.
    const axe = new TestTab(port, undefined, undefined, false);
    tabs.push(axe);
    await axe.welcome(SEAT);
    await until(() => link.current !== null);

    await until(() => link.current === null, 2000);
  });
});
