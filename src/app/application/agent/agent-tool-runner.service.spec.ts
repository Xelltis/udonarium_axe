import { TestBed } from '@angular/core/testing';
import { AgentToolRunner, refusalOf } from '@axe/application/agent/agent-tool-runner.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import { agentToolOf } from '@axe/core/agent/agent-tools';
import { PeerRole } from '@axe/domain/peer/peer-role';

describe('refusalOf', () => {
  it('lets any seat read', () => {
    expect(refusalOf({ access: 'read' }, 'read', PeerRole.Guest)).toBeNull();
  });

  it('lets a seat change the room only where it allows it and its role may', () => {
    expect(refusalOf({ access: 'write' }, 'write', PeerRole.Player)).toBeNull();
    expect(refusalOf({ access: 'write' }, 'read', PeerRole.GameMaster)?.message).toContain('read the room only');
    expect(refusalOf({ access: 'write' }, 'write', PeerRole.Guest)?.message).toContain('watches the room');
  });

  it('keeps a tool that writes a file or keeps a snapshot for the person to a seat letting its AI change things', () => {
    for (const tool of [agentToolOf('save_room')!, agentToolOf('save_room_snapshot')!]) {
      expect(refusalOf(tool, 'read', PeerRole.Player)?.message, tool.name).toContain('keeps a file or a snapshot');
      expect(refusalOf(tool, 'write', PeerRole.Guest), tool.name).toBeNull();
    }
    expect(refusalOf(agentToolOf('get_room')!, 'read', PeerRole.Guest)).toBeNull();
  });

  it('leaves the master’s tools to the master’s seat', () => {
    expect(refusalOf({ access: 'gm' }, 'write', PeerRole.GameMaster)).toBeNull();
    expect(refusalOf({ access: 'gm' }, 'write', PeerRole.Player)).toEqual({
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
    runner.provide({ send_chat: handler, apply_scene: handler });
    role = PeerRole.Player;

    expect(await runner.run('send_chat', { text: 'hi' }, 'read', signal)).toMatchObject({
      ok: false,
      error: { code: 'not_allowed' },
    });
    expect(await runner.run('apply_scene', { scene: 'battle' }, 'write', signal)).toMatchObject({
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

  it('keeps the calls that keep something for the person by the same test as their leave, a file noted by name and size', async () => {
    runner.provide({
      save_room: () => ({ room: 'r' }),
      save_room_snapshot: () => ({ id: 's1' }),
      import_asset: () => ({ id: 'a1' }),
      list_room_snapshots: () => ({ snapshots: [] }),
    });
    const file = { name: 'goblin.png', type: 'image/png', base64: 'A'.repeat(4_000_000) + 'AQ==' };
    const stringify = vi.spyOn(JSON, 'stringify');

    await runner.run('save_room', { path: 'room.zip' }, 'write', signal);
    await runner.run('save_room_snapshot', {}, 'write', signal);
    await runner.run('list_room_snapshots', {}, 'write', signal);
    await runner.run('import_asset', { path: 'goblin.png', file }, 'write', signal);

    expect(runner.history().map((entry) => entry.tool)).toEqual(['import_asset', 'save_room_snapshot', 'save_room']);
    expect(runner.history()[0].input).toBe('{"path":"goblin.png","file":"goblin.png (3000001 bytes)"}');
    const longest = Math.max(
      ...stringify.mock.results.map(({ value }) => (typeof value === 'string' ? value.length : 0))
    );
    stringify.mockRestore();
    expect(longest).toBeLessThan(1000);
  });
});
