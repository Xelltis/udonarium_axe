import { TestBed } from '@angular/core/testing';
import { AgentToolRunner, refusalOf } from '@axe/application/agent/agent-tool-runner.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import { PeerRole } from '@axe/domain/peer/peer-role';

describe('refusalOf', () => {
  it('lets any seat read', () => {
    expect(refusalOf('read', 'read', PeerRole.Guest)).toBeNull();
  });

  it('lets a seat change the room only where it allows it and its role may', () => {
    expect(refusalOf('write', 'write', PeerRole.Player)).toBeNull();
    expect(refusalOf('write', 'read', PeerRole.GameMaster)?.message).toContain('read the room only');
    expect(refusalOf('write', 'write', PeerRole.Guest)?.message).toContain('watches the room');
  });

  it('leaves the master’s tools to the master’s seat', () => {
    expect(refusalOf('gm', 'write', PeerRole.GameMaster)).toBeNull();
    expect(refusalOf('gm', 'write', PeerRole.Player)).toEqual({
      code: 'not_allowed',
      message: "Only the game master's seat may use this tool.",
    });
  });
});

describe('AgentToolRunner', () => {
  let runner: AgentToolRunner;
  let role: PeerRole;
  const signal = new AbortController().signal;

  beforeEach(() => {
    role = PeerRole.GameMaster;
    TestBed.configureTestingModule({
      providers: [{ provide: RolePermissionService, useValue: { role: () => role } }],
    });
    runner = TestBed.inject(AgentToolRunner);
  });

  it('runs a tool with its input and hands back what it returns', async () => {
    const handler = vi.fn((args: Readonly<Record<string, unknown>>) => ({ moved: args['piece'] }));
    runner.provide({ move_piece: handler });

    expect(await runner.run('move_piece', { piece: 'ゴブリン', col: 2, row: 3 }, 'write', signal)).toEqual({
      ok: true,
      value: { moved: 'ゴブリン' },
    });
    expect(handler).toHaveBeenCalledWith({ piece: 'ゴブリン', col: 2, row: 3 }, { signal });
  });

  it('refuses a tool it does not know, input that does not fit, and a tool not made runnable', async () => {
    expect(await runner.run('fly', {}, 'write', signal)).toMatchObject({ ok: false, error: { code: 'unknown_tool' } });
    expect(await runner.run('move_piece', { piece: 'x' }, 'write', signal)).toMatchObject({
      ok: false,
      error: { code: 'invalid_input', message: 'input.col is required; input.row is required' },
    });
    expect(await runner.run('get_room', {}, 'read', signal)).toEqual({
      ok: false,
      error: { code: 'unknown_tool', message: 'get_room cannot be used here yet.' },
    });
  });

  it('refuses a change the seat does not allow, without running the tool', async () => {
    const handler = vi.fn();
    runner.provide({ send_chat: handler, play_sound: handler });
    role = PeerRole.Player;

    expect(await runner.run('send_chat', { text: 'hi' }, 'read', signal)).toMatchObject({
      ok: false,
      error: { code: 'not_allowed' },
    });
    expect(await runner.run('play_sound', { kind: 'bgm', sound: 'battle' }, 'write', signal)).toMatchObject({
      ok: false,
      error: { code: 'not_allowed' },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('answers a tool’s own refusal as it was, and anything else it throws as a failure', async () => {
    runner.provide({
      move_piece: () => {
        throw new AgentToolError('not_found', 'There is no piece named x.');
      },
      remove_piece: async () => {
        throw new Error('broke');
      },
    });

    expect(await runner.run('move_piece', { piece: 'x', col: 1, row: 1 }, 'write', signal)).toEqual({
      ok: false,
      error: { code: 'not_found', message: 'There is no piece named x.' },
    });
    expect(await runner.run('remove_piece', { piece: 'x' }, 'write', signal)).toEqual({
      ok: false,
      error: { code: 'failed', message: 'broke' },
    });
  });

  it('keeps the calls that change the room, and those refused, newest first, but not the reading', async () => {
    runner.provide({ get_room: () => ({}), send_chat: () => ({ id: 'm1' }) });

    await runner.run('get_room', {}, 'read', signal);
    await runner.run('send_chat', { text: 'こんにちは' }, 'write', signal);
    await runner.run('send_chat', { text: 'x'.repeat(300) }, 'read', signal);

    const [refused, sent] = runner.history();
    expect(runner.history()).toHaveLength(2);
    expect(sent).toMatchObject({ tool: 'send_chat', input: '{"text":"こんにちは"}', error: null });
    expect(refused.error?.code).toBe('not_allowed');
    expect(refused.input).toHaveLength(120);
    expect(refused.input.endsWith('…')).toBe(true);

    runner.clearHistory();
    expect(runner.history()).toEqual([]);
  });
});
