import type Anthropic from '@anthropic-ai/sdk';
import { AuthenticationError, BadRequestError } from '@anthropic-ai/sdk';
import { GM_GUIDE, GM_SET_ASIDE_PROMPT } from '@axe/core/agent/agent-gm';
import type { GmSettings } from '@axe/core/agent/agent-protocol';

import type { CallOutcome } from '../tab-link';
import { FakeApi, reply, toolUse } from './fake-api';
import { GameMaster, type GmTabCall, SET_ASIDE_AT } from './game-master';

const SETTINGS: GmSettings = { model: 'claude-opus-5-5', effort: 'medium', budgetUsd: 5 };

describe('GameMaster', () => {
  let api: FakeApi;
  let calls: { tool: string; args: Readonly<Record<string, unknown>> }[];
  let answer: (tool: string, args: Readonly<Record<string, unknown>>) => CallOutcome;
  let notes: string[];
  let said: string[];
  let master: GameMaster;
  const signal = new AbortController().signal;

  const call: GmTabCall = async (tool, args) => {
    calls.push({ tool, args });
    return answer(tool, args);
  };

  beforeEach(() => {
    api = new FakeApi();
    calls = [];
    notes = [];
    said = [];
    answer = (tool) => ({ ok: true, value: { tool } });
    master = new GameMaster(
      api,
      call,
      { notes: (written) => notes.push(written), said: (text) => said.push(text), changed: () => undefined },
      { settings: SETTINGS, instructions: '舞台は港町', notes: '' }
    );
  });

  function textOf(message: Anthropic.MessageParam): string {
    return typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
  }

  it('opens on the room and the recent chat, the guide and instructions cached for an hour and the rest as it grows', async () => {
    api.replies.push(reply([{ type: 'text', text: 'ようこそ' }]));

    expect(await master.takeTurn(['nudge'], [], '', signal)).toEqual({ kind: 'done' });

    expect(calls).toEqual([
      { tool: 'get_room', args: {} },
      { tool: 'read_chat', args: { limit: 30 } },
    ]);
    const [request] = api.sent;
    expect(request).toMatchObject({
      model: 'claude-opus-5-5',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
      system: [
        { type: 'text', text: GM_GUIDE },
        { type: 'text', text: expect.stringContaining('舞台は港町'), cache_control: { type: 'ephemeral', ttl: '1h' } },
      ],
    });
    const tools = request.tools as Anthropic.Tool[];
    expect(tools.map((tool) => tool.name)).toContain('update_notes');
    expect(tools.map((tool) => tool.name)).not.toContain('wait_for_events');
    expect(tools.every((tool) => tool.eager_input_streaming === true)).toBe(true);
    expect(request.messages).toHaveLength(1);
    expect(textOf(request.messages[0])).toContain('Greet the players');
    expect(said).toEqual(['ようこそ']);
    expect(master.kept).toBe(true);
  });

  it('runs the tools the model calls on the tab, hands back each answer, and goes on until it ends its turn', async () => {
    api.replies.push(reply([{ type: 'text', text: 'x' }]));
    await master.takeTurn(['nudge'], [], '', signal);
    calls = [];
    answer = (tool) =>
      tool === 'roll_dice'
        ? { ok: true, value: { result: 7 } }
        : { ok: false, error: { code: 'not_found', message: 'No piece is called ゴブリンC.' } };
    api.replies.push(
      reply(
        [
          toolUse('t1', 'roll_dice', { command: '2d6' }),
          toolUse('t2', 'move_piece', { piece: 'ゴブリンC', col: 2, row: 3 }),
        ],
        'tool_use'
      ),
      reply([])
    );

    expect(await master.takeTurn(['line'], [{ kind: 'chat', text: '扉を開ける' }], '', signal)).toEqual({
      kind: 'done',
    });

    expect(calls.map((each) => each.tool)).toEqual(['roll_dice', 'move_piece']);
    const answered = api.sent[2].messages.at(-1)!;
    expect(answered).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 't1', content: '{"result":7}' },
        {
          type: 'tool_result',
          tool_use_id: 't2',
          content: 'not_found: No piece is called ゴブリンC.',
          is_error: true,
        },
      ],
    });
  });

  it('sends every request on the one before unchanged, so that what was cached is read again', async () => {
    api.replies.push(
      reply([{ type: 'text', text: 'ようこそ' }]),
      reply([toolUse('t1', 'get_room', {})], 'tool_use'),
      reply([])
    );
    await master.takeTurn(['nudge'], [], '', signal);
    await master.takeTurn(['line'], [{ kind: 'chat', text: 'こんにちは' }], '', signal);

    for (let i = 1; i < api.sent.length; i++) {
      const [before, after] = [api.sent[i - 1], api.sent[i]];
      expect(after.system).toEqual(before.system);
      expect(after.tools).toEqual(before.tools);
      expect(after.messages.slice(0, before.messages.length)).toEqual(before.messages);
    }
  });

  it('keeps its notebook itself, telling the bridge, and refuses one too long', async () => {
    api.replies.push(
      reply([toolUse('n1', 'update_notes', { notes: '一行目' })], 'tool_use'),
      reply([toolUse('n2', 'update_notes', { notes: 'x'.repeat(8001) })], 'tool_use'),
      reply([])
    );
    await master.takeTurn(['nudge'], [], '', signal);

    expect(notes).toEqual(['一行目']);
    expect(master.notes).toBe('一行目');
    expect(calls.map((each) => each.tool)).toEqual(['get_room', 'read_chat']);
    const refused = (api.sent[2].messages.at(-1)!.content as Anthropic.ToolResultBlockParam[])[0];
    expect(refused).toMatchObject({
      tool_use_id: 'n2',
      is_error: true,
      content: expect.stringContaining('invalid_input'),
    });
  });

  it('reckons what each response cost, and stops before a request once the budget is spent', async () => {
    master.update({ ...SETTINGS, budgetUsd: 0.01 }, '舞台は港町', '');
    api.replies.push(
      reply([toolUse('t1', 'get_room', {})], 'tool_use', { input_tokens: 1000, output_tokens: 1000 }),
      reply([])
    );

    expect(await master.takeTurn(['nudge'], [], '', signal)).toEqual({ kind: 'budget', of: 'start' });
    // 1000 × $4 + 1000 × $20 a million tokens.
    expect(master.spentUsd).toBeCloseTo(0.024);
    expect(api.sent).toHaveLength(1);
  });

  it('tells the model changed instructions and a word from the seat with its next turn, leaving the system prompt be', async () => {
    api.replies.push(reply([]), reply([]));
    await master.takeTurn(['nudge'], [], '', signal);
    master.update(SETTINGS, '舞台は雪山', '');
    await master.takeTurn(['nudge'], [], 'そろそろ戦闘を', signal);

    const [first, second] = api.sent;
    expect(second.system).toEqual(first.system);
    expect(second.messages.slice(-2)).toEqual([
      { role: 'user', content: expect.stringContaining('the person at your seat asked you to go on') },
      {
        role: 'system',
        content: "The game master's instructions are now:\n舞台は雪山\n\nThe person at your seat says: そろそろ戦闘を",
      },
    ]);
  });

  it('opens a new conversation for another model, as one cannot read the other’s thinking', async () => {
    api.replies.push(reply([]), reply([]));
    await master.takeTurn(['nudge'], [], '', signal);
    master.update({ ...SETTINGS, model: 'claude-sonnet-5-5' }, '舞台は港町', '');
    expect(master.kept).toBe(false);
    await master.takeTurn(['line'], [], '', signal);

    expect(api.sent[1].model).toBe('claude-sonnet-5-5');
    expect(textOf(api.sent[1].messages[0])).toContain('The session begins');
  });

  it('sets the conversation aside once it grows long, after the model writes its notebook, and carries on from it', async () => {
    api.replies.push(
      reply([], 'end_turn', { cache_read_input_tokens: SET_ASIDE_AT }),
      reply([toolUse('n1', 'update_notes', { notes: '港町で依頼を受けた' })], 'tool_use'),
      reply([]),
      reply([])
    );
    await master.takeTurn(['nudge'], [], '', signal);

    expect(textOf(api.sent[1].messages.at(-1)!)).toBe(GM_SET_ASIDE_PROMPT);
    expect(master.kept).toBe(false);
    await master.takeTurn(['line'], [], '', signal);
    expect(api.sent[3].system![1]).toMatchObject({ text: expect.stringContaining('港町で依頼を受けた') });
    expect(textOf(api.sent[3].messages[0])).toContain('carries on from your notebook');
  });

  it('answers without running a call in a response cut off or refused', async () => {
    api.replies.push(reply([toolUse('t1', 'move_piece', { piece: 'ゴブ' })], 'max_tokens'));
    expect(await master.takeTurn(['nudge'], [], '', signal)).toEqual({
      kind: 'failed',
      message: 'The response was cut off.',
    });
    api.replies.push(reply([], 'refusal'));
    expect(await master.takeTurn(['line'], [], '', signal)).toMatchObject({ kind: 'failed' });

    expect(calls.map((each) => each.tool)).toEqual(['get_room', 'read_chat']);
    expect(api.sent[1].messages[2]).toEqual({
      role: 'user',
      content: [expect.objectContaining({ tool_use_id: 't1', is_error: true })],
    });
  });

  it('stops at once when told to, and tells again with the next turn the word no response followed', async () => {
    api.replies.push(reply([]), 'hang', reply([]));
    await master.takeTurn(['nudge'], [], '', signal);
    const stop = new AbortController();
    const turn = master.takeTurn(['line'], [], 'まとめて', stop.signal);
    await vi.waitFor(() => expect(api.sent).toHaveLength(2));
    stop.abort();

    expect(await turn).toEqual({ kind: 'stopped', told: true });
    await master.takeTurn(['line'], [], '', signal);
    const messages = api.sent[2].messages;
    expect(messages.at(-1)).toEqual({ role: 'system', content: 'The person at your seat says: まとめて' });
    expect(messages.filter((message) => message.role === 'system')).toHaveLength(1);
  });

  it('ends a turn whose model was changed during it, without setting aside the conversation that took over', async () => {
    api.replies.push(reply([]));
    await master.takeTurn(['nudge'], [], '', signal);
    answer = () => {
      master.update({ ...SETTINGS, model: 'claude-sonnet-5-5' }, '舞台は港町', '');
      return { ok: true, value: {} };
    };
    api.replies.push(reply([toolUse('t1', 'get_room', {})], 'tool_use', { cache_read_input_tokens: SET_ASIDE_AT }));

    expect(await master.takeTurn(['line'], [], '', signal)).toEqual({ kind: 'done' });
    expect(api.sent).toHaveLength(2);
    expect(master.kept).toBe(false);
  });

  it('tells a conversation kept what was changed while it was stopped, once started again', async () => {
    api.replies.push(reply([]), reply([]));
    await master.takeTurn(['nudge'], [], '', signal);
    master.restart(false);
    master.update(SETTINGS, '舞台は雪山', '人の書いたメモ');
    await master.takeTurn(['nudge'], [], '', signal);

    expect(api.sent[1].messages.at(-1)).toEqual({
      role: 'system',
      content:
        "The game master's instructions are now:\n舞台は雪山\n\n" +
        'The person at your seat rewrote your notebook. It now reads:\n人の書いたメモ',
    });
  });

  it('keeps out a response with nothing in it, and opens anew after a request the API would not take', async () => {
    api.replies.push(reply([]), reply([], 'refusal'), reply([]));
    await master.takeTurn(['nudge'], [], '', signal);
    expect(await master.takeTurn(['line'], [], '', signal)).toMatchObject({ kind: 'failed' });
    await master.takeTurn(['line'], [], '', signal);
    expect(api.sent[2].messages.every((message) => message.content.length > 0)).toBe(true);

    api.replies.push(new BadRequestError(400, {}, 'messages: text content blocks must be non-empty', new Headers()));
    expect(await master.takeTurn(['line'], [], '', signal)).toMatchObject({ kind: 'failed' });
    expect(master.kept).toBe(false);
  });

  it('counts what a response that failed on the way still cost', async () => {
    api.replies.push(
      {
        fail: new SyntaxError('Unexpected end of JSON input'),
        partial: reply([], 'end_turn', { input_tokens: 1000, output_tokens: 1000 }),
      },
      reply([])
    );
    await master.takeTurn(['nudge'], [], '', signal);

    // The failed one, 1000 × $4 + 1000 × $20, and the one that came, 100 × $4 + 50 × $20, a million tokens.
    expect(master.spentUsd).toBeCloseTo(0.024 + 0.0014);
  });

  it('gives up on a key the API refuses, and asks again for a response it could not read', async () => {
    api.replies.push(new SyntaxError('Unexpected end of JSON input'), reply([]));
    expect(await master.takeTurn(['nudge'], [], '', signal)).toEqual({ kind: 'done' });
    expect(api.sent).toHaveLength(2);

    api.replies.push(new AuthenticationError(401, {}, 'invalid x-api-key', new Headers()));
    expect(await master.takeTurn(['line'], [], '', signal)).toMatchObject({ kind: 'key' });
  });
});
