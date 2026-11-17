import type { AgentSeat, GmStatus } from '@axe/core/agent/agent-protocol';

import { TabLink } from '../tab-link';
import { TestTab, until } from '../test-tab';
import { FakeApi, reply, toolUse } from './fake-api';
import { GmHost } from './gm-host';
import { CLAUDE_MODELS, gmModelOffers, namedModel, useGmModels } from './gm-models';

const GM: AgentSeat = { name: 'AI GM', role: 'gm', scope: 'write' };
const SETTINGS = { model: 'claude-opus-5-5', effort: 'medium', budgetUsd: 5 };

describe('GmHost', () => {
  let link: TabLink;
  let api: FakeApi;
  let host: GmHost;
  let port: number;
  const tabs: TestTab[] = [];

  beforeEach(async () => {
    link = new TabLink({
      port: 0,
      origins: ['http://localhost:4200'],
      bridge: '1.80.0',
      log: () => undefined,
      mode: 'gm',
      models: gmModelOffers(),
      tabGraceMs: 0,
    });
    api = new FakeApi();
    host = new GmHost({ link, api, log: () => undefined, quietMs: 40, longestWaitMs: 150 });
    port = await link.listen();
  });

  afterEach(async () => {
    useGmModels(CLAUDE_MODELS);
    host.close();
    for (const tab of tabs.splice(0)) tab.close();
    await link.close();
  });

  async function connect(seat = GM): Promise<TestTab> {
    const tab = new TestTab(port);
    tabs.push(tab);
    tab.answer = (tool) => ({ tool });
    await tab.welcome(seat);
    await until(() => link.current !== null);
    return tab;
  }

  function statuses(tab: TestTab): GmStatus[] {
    return tab.heard.flatMap((message) =>
      (message as { type?: string })?.type === 'gm.status' ? [(message as { status: GmStatus }).status] : []
    );
  }

  function lastStatus(tab: TestTab): GmStatus | undefined {
    return statuses(tab).at(-1);
  }

  function heardOf(tab: TestTab, type: string): unknown[] {
    return tab.heard.filter((message) => (message as { type?: string })?.type === type);
  }

  it('tells a tab how the game master stands as it connects', async () => {
    const tab = await connect();
    await until(() => lastStatus(tab) !== undefined);
    expect(lastStatus(tab)).toEqual({
      run: 'off',
      model: '',
      spentUsd: 0,
      budgetUsd: 0,
      contextTokens: 0,
      kept: false,
      starts: 0,
    });
  });

  it('starts only on the game master’s seat let to change the room, and only on a model it runs', async () => {
    const tab = await connect({ ...GM, scope: 'read' });
    tab.say({ type: 'gm.start', settings: SETTINGS, instructions: '', notes: '' });
    await until(() => lastStatus(tab)?.problem !== undefined);
    expect(lastStatus(tab)).toMatchObject({ run: 'off', problem: expect.stringContaining("game master's seat") });

    tab.say({ type: 'gm.start', settings: { ...SETTINGS, model: 'claude-other' }, instructions: '', notes: '' });
    await until(() => lastStatus(tab)?.problem?.includes('claude-other') === true);
    expect(api.sent).toEqual([]);

    tab.say({ type: 'gm.start', settings: { ...SETTINGS, model: 'x'.repeat(100) }, instructions: '', notes: '' });
    await until(() => lastStatus(tab)?.problem?.includes('xxx') === true);
    expect(lastStatus(tab)?.problem).toBe(`This bridge does not run ${'x'.repeat(100)}.`);
    expect(lastStatus(tab)?.starts).toBe(3);
    // Each asking is counted as it is answered, so a tab tells the answer to its own; a change is not one.
    const told = statuses(tab).length;
    tab.say({ type: 'gm.update', settings: { ...SETTINGS, budgetUsd: 7 }, instructions: '', notes: '' });
    await until(() => statuses(tab).length > told);
    expect(lastStatus(tab)?.starts).toBe(3);
  });

  it('keeps the model it runs when told to change to one it has no price for', async () => {
    const tab = await connect();
    api.replies.push(reply([]));
    tab.say({ type: 'gm.start', settings: SETTINGS, instructions: '', notes: '' });
    await until(() => api.sent.length === 1 && lastStatus(tab)?.run === 'waiting');

    tab.say({
      type: 'gm.update',
      settings: { ...SETTINGS, model: 'claude-other', budgetUsd: 9 },
      instructions: '',
      notes: '',
    });
    await until(() => lastStatus(tab)?.budgetUsd === 9);
    // The rest of the change is taken, with the model kept.
    expect(lastStatus(tab)).toMatchObject({ run: 'waiting', model: 'claude-opus-5-5', budgetUsd: 9 });
  });

  it('opens at once when started, the model greeting the table, then waits', async () => {
    const tab = await connect();
    api.replies.push(
      reply(
        [{ type: 'text', text: '酒場の場面から始めます' }, toolUse('t1', 'send_chat', { text: 'ようこそ' })],
        'tool_use'
      ),
      reply([])
    );
    tab.say({ type: 'gm.start', settings: SETTINGS, instructions: '舞台は港町', notes: '', fresh: true });

    await until(() => api.sent.length === 2 && lastStatus(tab)?.run === 'waiting');
    expect(statuses(tab).map((status) => status.run)).toContain('thinking');
    expect(heardOf(tab, 'call').map((call) => (call as { tool: string }).tool)).toEqual([
      'get_room',
      'read_chat',
      'send_chat',
    ]);
    expect(heardOf(tab, 'gm.said')).toEqual([
      { type: 'gm.said', text: '酒場の場面から始めます', at: expect.any(Number) },
    ]);
    expect(lastStatus(tab)).toMatchObject({ model: 'claude-opus-5-5', budgetUsd: 5, kept: true });
    expect(lastStatus(tab)!.spentUsd).toBeGreaterThan(0);
  });

  it('takes a turn once something calls for one and the room goes quiet, with everything that happened since', async () => {
    const tab = await connect();
    api.replies.push(reply([]));
    tab.say({ type: 'gm.start', settings: SETTINGS, instructions: '', notes: '' });
    await until(() => api.sent.length === 1 && lastStatus(tab)?.run === 'waiting');

    tab.say({ type: 'gm.events', events: [{ event: { kind: 'seat_joined', seat: 'アリス' } }] });
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(api.sent).toHaveLength(1);

    api.replies.push(reply([]));
    tab.say({ type: 'gm.events', events: [{ event: { kind: 'chat', text: '扉を開ける' }, wake: 'line' }] });
    await until(() => api.sent.length === 2);
    const prompt = api.sent[1].messages.at(-1)!.content as string;
    expect(prompt).toContain('a player spoke');
    expect(prompt).toContain('"seat":"アリス"');
    expect(prompt).toContain('扉を開ける');
  });

  it('stops at once when told to, giving up the turn under way, and takes no turn after', async () => {
    const tab = await connect();
    api.replies.push('hang');
    tab.say({ type: 'gm.start', settings: SETTINGS, instructions: '', notes: '' });
    await until(() => lastStatus(tab)?.run === 'thinking');

    tab.say({ type: 'gm.stop' });
    await until(() => lastStatus(tab)?.halted !== undefined);
    expect(lastStatus(tab)).toMatchObject({ halted: 'asked' });
    tab.say({ type: 'gm.events', events: [{ event: { kind: 'chat' }, wake: 'line' }] });
    tab.say({ type: 'gm.nudge', direction: '' });
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(api.sent).toHaveLength(1);
  });

  it('stops once the budget is spent', async () => {
    const tab = await connect();
    api.replies.push(
      reply([toolUse('t1', 'get_room', {})], 'tool_use', { input_tokens: 10_000, output_tokens: 10_000 })
    );
    tab.say({ type: 'gm.start', settings: { ...SETTINGS, budgetUsd: 0.1 }, instructions: '', notes: '' });

    await until(() => lastStatus(tab)?.halted !== undefined);
    expect(lastStatus(tab)).toMatchObject({ halted: 'budget', budgetUsd: 0.1 });
    expect(lastStatus(tab)!.spentUsd).toBeGreaterThanOrEqual(0.1);
  });

  it('takes again a turn given up as the tab went away, once the tab is back, and tells it the notebook', async () => {
    const first = await connect();
    api.replies.push(reply([toolUse('n1', 'update_notes', { notes: '港町に着いた' })], 'tool_use'), reply([]), 'hang');
    first.say({ type: 'gm.start', settings: SETTINGS, instructions: '', notes: '' });
    await until(() => api.sent.length === 2 && lastStatus(first)?.run === 'waiting');
    first.say({ type: 'gm.events', events: [{ event: { kind: 'chat', text: '北へ向かう' }, wake: 'line' }] });
    await until(() => api.sent.length === 3);

    first.close();
    await until(() => link.current === null);
    api.replies.push(reply([]));
    const second = await connect();
    await until(() => api.sent.length === 4);
    // The line had reached the conversation before the tab went away: it is not told twice.
    expect(JSON.stringify(api.sent[3].messages).split('北へ向かう')).toHaveLength(2);
    expect(api.sent[3].messages.at(-1)!.content as string).toContain('a player spoke');
    expect(heardOf(second, 'gm.notes')).toEqual([{ type: 'gm.notes', notes: '港町に着いた' }]);
  });

  it('stops once the seat is no longer the game master’s, let to change the room', async () => {
    const tab = await connect();
    api.replies.push(reply([]));
    tab.say({ type: 'gm.start', settings: SETTINGS, instructions: '', notes: '' });
    await until(() => api.sent.length === 1 && lastStatus(tab)?.run === 'waiting');

    tab.say({ type: 'seat', seat: { ...GM, scope: 'read' } });
    await until(() => lastStatus(tab)?.halted !== undefined);
    expect(lastStatus(tab)).toMatchObject({ run: 'off', halted: 'seat' });
  });

  it('holds what the bridge may spend over every start, so that starting again does not spend more', async () => {
    host.close();
    await link.close();
    link = new TabLink({
      port: 0,
      origins: ['http://localhost:4200'],
      bridge: '1.80.0',
      log: () => undefined,
      mode: 'gm',
      models: gmModelOffers(),
      tabGraceMs: 0,
    });
    host = new GmHost({ link, api, log: () => undefined, quietMs: 40, longestWaitMs: 150, maxUsd: 0.05 });
    port = await link.listen();
    const tab = await connect();
    // 10,000 × $4 + 1,000 × $20 a million tokens: 6 cents, over the bridge's 5.
    api.replies.push(reply([], 'end_turn', { input_tokens: 10_000, output_tokens: 1000 }));
    tab.say({ type: 'gm.start', settings: SETTINGS, instructions: '', notes: '' });
    await until(() => api.sent.length === 1 && lastStatus(tab)?.run === 'waiting');
    tab.say({ type: 'gm.nudge', direction: '' });
    await until(() => lastStatus(tab)?.halted !== undefined);
    expect(lastStatus(tab)).toMatchObject({ halted: 'budget', problem: expect.stringContaining('--max-usd') });

    tab.say({ type: 'gm.start', settings: { ...SETTINGS, budgetUsd: 1000 }, instructions: '', notes: '' });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(lastStatus(tab)).toMatchObject({ run: 'off' });
    expect(api.sent).toHaveLength(1);
  });

  it('holds a model with no price by the tokens it uses, telling them in place of dollars', async () => {
    host.close();
    await link.close();
    useGmModels([namedModel('llama-at-hand', null)]);
    link = new TabLink({
      port: 0,
      origins: ['http://localhost:4200'],
      bridge: '1.80.0',
      log: () => undefined,
      mode: 'gm',
      models: gmModelOffers(),
      tabGraceMs: 0,
    });
    host = new GmHost({ link, api, log: () => undefined, quietMs: 40, longestWaitMs: 150, maxTokens: 10_000 });
    port = await link.listen();
    const tab = await connect();
    await until(() => lastStatus(tab) !== undefined);
    expect(lastStatus(tab)?.tokens).toEqual({ spent: 0, limit: 10_000 });

    const settings = { ...SETTINGS, model: 'llama-at-hand', budgetUsd: 0.0001 };
    api.replies.push(reply([], 'end_turn', { input_tokens: 9000, output_tokens: 2000 }));
    tab.say({ type: 'gm.start', settings, instructions: '', notes: '' });
    await until(() => api.sent.length === 1 && lastStatus(tab)?.run === 'waiting');
    // What it spent is not known, so the dollars of the start do not stop it: the tokens do.
    expect(lastStatus(tab)).toMatchObject({ spentUsd: 0, tokens: { spent: 11_000, limit: 10_000 } });

    tab.say({ type: 'gm.nudge', direction: '' });
    await until(() => lastStatus(tab)?.halted !== undefined);
    expect(lastStatus(tab)).toMatchObject({ halted: 'budget', problem: expect.stringContaining('--max-tokens') });
    tab.say({ type: 'gm.start', settings, instructions: '', notes: '' });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(lastStatus(tab)).toMatchObject({ run: 'off' });
    expect(api.sent).toHaveLength(1);
  });
});
