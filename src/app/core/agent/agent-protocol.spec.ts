import { readBridgeMessage, readTabMessage } from '@axe/core/agent/agent-protocol';

describe('readBridgeMessage', () => {
  it('reads each message the bridge sends, from text or from an object', () => {
    expect(readBridgeMessage('{"type":"hello","protocol":2,"tools":"abc","bridge":"1.80.0","mode":"mcp"}')).toEqual({
      type: 'hello',
      protocol: 2,
      tools: 'abc',
      bridge: '1.80.0',
      mode: 'mcp',
      models: [],
    });
    expect(
      readBridgeMessage({
        type: 'hello',
        protocol: 2,
        tools: 'abc',
        bridge: '1.80.0',
        mode: 'gm',
        models: [{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }],
      })
    ).toMatchObject({ mode: 'gm', models: [{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5' }] });
    expect(readBridgeMessage({ type: 'refuse', reason: 'busy', protocol: 1, tools: 'abc', bridge: '1.80.0' })).toEqual({
      type: 'refuse',
      reason: 'busy',
      protocol: 1,
      tools: 'abc',
      bridge: '1.80.0',
    });
    expect(readBridgeMessage({ type: 'call', id: 'c1', tool: 'get_room' })).toEqual({
      type: 'call',
      id: 'c1',
      tool: 'get_room',
      args: {},
    });
    expect(readBridgeMessage({ type: 'call', id: 'c2', tool: 'move_piece', args: { col: 2 } })).toMatchObject({
      args: { col: 2 },
    });
    expect(readBridgeMessage({ type: 'cancel', id: 'c1' })).toEqual({ type: 'cancel', id: 'c1' });
    const status = {
      run: 'off',
      halted: 'budget',
      model: 'claude-opus-5-5',
      spentUsd: 5.01,
      budgetUsd: 5,
      contextTokens: 12000,
      kept: true,
      problem: 'out of budget',
      tokens: { spent: 1200, limit: 2000000 },
      starts: 2,
    };
    expect(readBridgeMessage({ type: 'gm.status', status })).toEqual({ type: 'gm.status', status });
    const handed = { run: 'waiting', model: '', spentUsd: 0, budgetUsd: 0, contextTokens: 0, kept: true, starts: 1 };
    expect(readBridgeMessage({ type: 'gm.status', status: { ...handed, attended: false } })).toEqual({
      type: 'gm.status',
      status: { ...handed, attended: false },
    });
    expect(readBridgeMessage({ type: 'gm.status', status: { ...handed, attended: 'no' } })).toBeNull();
    expect(readBridgeMessage({ type: 'gm.notes', notes: '村に着いた' })).toEqual({
      type: 'gm.notes',
      notes: '村に着いた',
    });
    expect(readBridgeMessage({ type: 'gm.said', text: '戦闘へ', at: 3 })).toEqual({
      type: 'gm.said',
      text: '戦闘へ',
      at: 3,
    });
  });

  it('reads nothing from what is not one of its messages', () => {
    for (const raw of [
      'not json',
      '[1]',
      null,
      { type: 'hello', protocol: '1', tools: 'abc', bridge: 'x', mode: 'mcp' },
      { type: 'hello', protocol: 1, bridge: 'x', mode: 'mcp' },
      { type: 'hello', protocol: 2, tools: 'abc', bridge: 'x' },
      { type: 'hello', protocol: 2, tools: 'abc', bridge: 'x', mode: 'gm', models: [{ id: 'm' }] },
      {
        type: 'gm.status',
        status: { run: 'asleep', model: 'm', spentUsd: 0, budgetUsd: 5, contextTokens: 0, kept: false, starts: 0 },
      },
      {
        type: 'gm.status',
        status: { run: 'off', model: 'm', spentUsd: -1, budgetUsd: 5, contextTokens: 0, kept: false, starts: 0 },
      },
      {
        type: 'gm.status',
        status: { run: 'off', model: 'm', spentUsd: 0, budgetUsd: 5, contextTokens: 0, kept: false },
      },
      { type: 'gm.notes', notes: 'x'.repeat(8001) },
      { type: 'gm.said', text: 'x' },
      { type: 'refuse', reason: 'tired', protocol: 1, bridge: 'x' },
      { type: 'refuse', reason: 'busy', bridge: 'x' },
      { type: 'call', id: 1, tool: 'get_room' },
      { type: 'call', id: 'c', tool: 'get_room', args: [1] },
      { type: 'cancel' },
      { type: 'welcome' },
    ]) {
      expect(readBridgeMessage(raw)).toBeNull();
    }
  });
});

describe('readTabMessage', () => {
  const seat = { name: 'AI GM', role: 'gm', scope: 'write' };

  it('reads each message a tab sends', () => {
    expect(readTabMessage({ type: 'welcome', protocol: 1, tools: 'abc', app: '1.80.0', seat })).toEqual({
      type: 'welcome',
      protocol: 1,
      tools: 'abc',
      app: '1.80.0',
      seat,
    });
    expect(readTabMessage(JSON.stringify({ type: 'seat', seat }))).toEqual({ type: 'seat', seat });
    expect(readTabMessage({ type: 'result', id: 'c1', ok: true, value: { a: 1 } })).toEqual({
      type: 'result',
      id: 'c1',
      ok: true,
      value: { a: 1 },
    });
    expect(
      readTabMessage({ type: 'result', id: 'c1', ok: false, error: { code: 'not_allowed', message: 'no' } })
    ).toEqual({ type: 'result', id: 'c1', ok: false, error: { code: 'not_allowed', message: 'no' } });
  });

  it('reads what a tab tells a game-master bridge', () => {
    const settings = { model: 'claude-opus-5-5', effort: 'medium', budgetUsd: 5 };
    expect(readTabMessage({ type: 'gm.start', settings, instructions: '舞台は港町', notes: '' })).toEqual({
      type: 'gm.start',
      settings,
      instructions: '舞台は港町',
      notes: '',
      fresh: false,
    });
    expect(readTabMessage({ type: 'gm.start', settings, instructions: '', notes: '', fresh: true })).toMatchObject({
      fresh: true,
    });
    expect(readTabMessage({ type: 'gm.update', settings, instructions: 'a', notes: 'b' })).toEqual({
      type: 'gm.update',
      settings,
      instructions: 'a',
      notes: 'b',
    });
    expect(
      readTabMessage({
        type: 'gm.events',
        events: [{ event: { kind: 'chat', text: 'やあ' }, wake: 'line' }, { event: {} }],
      })
    ).toEqual({ type: 'gm.events', events: [{ event: { kind: 'chat', text: 'やあ' }, wake: 'line' }, { event: {} }] });
    expect(readTabMessage({ type: 'gm.nudge', direction: '戦闘を始めて' })).toEqual({
      type: 'gm.nudge',
      direction: '戦闘を始めて',
    });
    expect(readTabMessage({ type: 'gm.stop' })).toEqual({ type: 'gm.stop' });
  });

  it('reads no game-master message with settings out of bounds or text too long', () => {
    const settings = { model: 'claude-opus-5-5', effort: 'medium', budgetUsd: 5 };
    for (const raw of [
      { type: 'gm.start', settings: { ...settings, model: '' }, instructions: '', notes: '' },
      { type: 'gm.start', settings: { ...settings, effort: 'max' }, instructions: '', notes: '' },
      { type: 'gm.start', settings: { ...settings, budgetUsd: 0 }, instructions: '', notes: '' },
      { type: 'gm.start', settings: { ...settings, budgetUsd: '5' }, instructions: '', notes: '' },
      { type: 'gm.start', settings: { ...settings, budgetUsd: 1001 }, instructions: '', notes: '' },
      { type: 'gm.start', settings, instructions: 'x'.repeat(50_001), notes: '' },
      { type: 'gm.update', settings, instructions: '' },
      { type: 'gm.events', events: [{ event: 'chat' }] },
      { type: 'gm.events', events: [{ event: {}, wake: 'shout' }] },
      { type: 'gm.events', events: Array.from({ length: 501 }, () => ({ event: {} })) },
      { type: 'gm.nudge', direction: 'x'.repeat(2001) },
      { type: 'gm.nudge' },
    ]) {
      expect(readTabMessage(raw)).toBeNull();
    }
  });

  it('reads an error of a kind it does not know as a failure', () => {
    expect(readTabMessage({ type: 'result', id: 'c1', ok: false, error: { code: 'odd', message: 'm' } })).toMatchObject(
      {
        error: { code: 'failed', message: 'm' },
      }
    );
  });

  it('reads nothing from a seat or a result it cannot make out', () => {
    for (const raw of [
      { type: 'welcome', protocol: 1, tools: 'abc', app: '1', seat: { ...seat, role: 'king' } },
      { type: 'welcome', protocol: 1, tools: 'abc', app: '1', seat: { ...seat, scope: 'all' } },
      { type: 'welcome', protocol: 1, tools: 'abc', seat },
      { type: 'welcome', protocol: 1, app: '1', seat },
      { type: 'seat', seat: { role: 'gm', scope: 'read' } },
      { type: 'result', ok: true },
      { type: 'result', id: 'c', ok: 'yes' },
      { type: 'result', id: 'c', ok: false, error: { code: 'failed' } },
      { type: 'hello', protocol: 1, tools: 'abc', bridge: '1' },
    ]) {
      expect(readTabMessage(raw)).toBeNull();
    }
  });
});
