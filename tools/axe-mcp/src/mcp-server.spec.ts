import { RUN_AI_GM_GUIDE_URI, RUN_AI_GM_PROMPT } from '@axe/core/agent/agent-gm';
import {
  CHAT_SYNTAX_GUIDE,
  CHAT_SYNTAX_GUIDE_URI,
  RUN_SESSION_GUIDE_URI,
  RUN_SESSION_PROMPT,
} from '@axe/core/agent/agent-guide';
import type { AgentSeat } from '@axe/core/agent/agent-protocol';
import { AGENT_TOOLS } from '@axe/core/agent/agent-tools';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { TurnDesk } from './gm/turn-desk';
import { createMcpServer } from './mcp-server';
import { TabLink } from './tab-link';
import { TestTab, until } from './test-tab';

const SEAT: AgentSeat = { name: 'AI GM', role: 'gm', scope: 'write' };

describe('createMcpServer', () => {
  let link: TabLink;
  let port: number;
  let client: Client;
  let axe: TestTab | null;

  beforeEach(async () => {
    link = new TabLink({
      port: 0,
      origins: ['http://localhost:4200'],
      bridge: '1.80.0',
      log: () => undefined,
      tabGraceMs: 0,
    });
    port = await link.listen();
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createMcpServer(link, '1.80.0').connect(serverSide);
    client = new Client({ name: 'spec', version: '1' });
    await client.connect(clientSide);
    axe = null;
  });

  afterEach(async () => {
    axe?.close();
    await client.close();
    await link.close();
  });

  async function connectTab(): Promise<TestTab> {
    axe = new TestTab(port);
    await axe.welcome(SEAT);
    await until(() => link.current !== null);
    return axe;
  }

  it('tells the AI how to begin, and names itself', () => {
    expect(client.getServerVersion()).toMatchObject({ name: 'udonarium-axe', version: '1.80.0' });
    expect(client.getInstructions()).toContain('Call get_room first');
  });

  it('lists every tool Axe defines, marking those that change nothing and those that take things away', async () => {
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(AGENT_TOOLS.map((tool) => tool.name));
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    expect(byName.get('get_room')?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(byName.get('send_chat')?.annotations).toMatchObject({ readOnlyHint: false });
    expect(byName.get('remove_piece')?.annotations).toMatchObject({ destructiveHint: true });
    expect(byName.get('move_piece')?.inputSchema).toMatchObject({ type: 'object', required: ['piece', 'col', 'row'] });
  });

  it('hands a call to the tab and its answer back as JSON text', async () => {
    const tab = await connectTab();
    tab.answer = (tool, args) => ({ tool, args });

    const result = await client.callTool({ name: 'move_piece', arguments: { piece: 'ゴブリン', col: 3, row: 4 } });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([
      { type: 'text', text: JSON.stringify({ tool: 'move_piece', args: { piece: 'ゴブリン', col: 3, row: 4 } }) },
    ]);
  });

  it('refuses a call it cannot hand on, saying why, without troubling the tab', async () => {
    expect(await client.callTool({ name: 'get_room', arguments: {} })).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: expect.stringMatching(/^not_connected: No tab of Axe is connected/) }],
    });

    const tab = await connectTab();
    expect(await client.callTool({ name: 'move_piece', arguments: { piece: 'x', col: 0 } })).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'invalid_input: input.row is required; input.col must be at least 1' }],
    });
    expect(await client.callTool({ name: 'fly', arguments: {} })).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'unknown_tool: There is no tool named fly.' }],
    });
    expect(tab.heard.filter((message) => (message as { type?: string })?.type === 'call')).toEqual([]);
  });

  it('gives a wait as long as it asks for, and more', async () => {
    const tab = await connectTab();
    tab.answer = () => undefined;
    const spy = vi.spyOn(link, 'call');

    const pending = client.callTool({ name: 'wait_for_events', arguments: { timeout_seconds: 7 } });
    await until(() => spy.mock.calls.length > 0);
    expect(spy.mock.calls[0][2]).toBe(17_000);
    tab.close();
    await pending;
  });

  it('hands the AI the prompt to run a session and the chat syntax', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toEqual(['run_session']);
    const prompt = await client.getPrompt({ name: 'run_session' });
    expect(prompt.messages[0].content).toEqual({ type: 'text', text: RUN_SESSION_PROMPT });
    await expect(client.getPrompt({ name: 'other' })).rejects.toThrow();

    const { resources } = await client.listResources();
    expect(resources.map((resource) => resource.uri)).toEqual([RUN_SESSION_GUIDE_URI, CHAT_SYNTAX_GUIDE_URI]);
    const read = await client.readResource({ uri: CHAT_SYNTAX_GUIDE_URI });
    expect(read.contents[0]).toMatchObject({ mimeType: 'text/markdown', text: CHAT_SYNTAX_GUIDE });
    const guide = await client.readResource({ uri: RUN_SESSION_GUIDE_URI });
    expect(guide.contents[0]).toMatchObject({ text: RUN_SESSION_PROMPT });
    await expect(client.readResource({ uri: 'axe://other' })).rejects.toThrow();
  });

  describe('with the desk the game master’s turns are handed at', () => {
    let desk: TurnDesk;
    let gm: Client;

    beforeEach(async () => {
      desk = new TurnDesk({ link, log: () => undefined, quietMs: 20, longestWaitMs: 100 });
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
      await createMcpServer(link, '1.81.0', desk).connect(serverSide);
      gm = new Client({ name: 'spec', version: '1' });
      await gm.connect(clientSide);
    });

    afterEach(async () => {
      desk.close();
      await gm.close();
    });

    function answerOf(result: Awaited<ReturnType<Client['callTool']>>): Record<string, unknown> {
      const [first] = result.content as { type: string; text: string }[];
      expect(result.isError, first?.text).toBeFalsy();
      return JSON.parse(first.text) as Record<string, unknown>;
    }

    it('lists the tools to wait for a turn and to keep the notebook after the table’s own', async () => {
      const { tools } = await gm.listTools();

      expect(tools.map((tool) => tool.name)).toEqual([
        ...AGENT_TOOLS.map((tool) => tool.name),
        'wait_for_turn',
        'update_notes',
      ]);
    });

    it('hands the AI its turn once the tab has started the game master, and tells the tab what it noted', async () => {
      const tab = await connectTab();
      const waiting = gm.callTool({ name: 'wait_for_turn', arguments: { timeout_seconds: 5 } });
      tab.say({
        type: 'gm.start',
        settings: { model: 'claude-opus-5-5', effort: 'medium', budgetUsd: 5 },
        instructions: '古城の探索',
        notes: '',
        fresh: false,
      });

      expect(answerOf(await waiting)).toMatchObject({ turn: true, instructions: '古城の探索', events: [] });

      expect(answerOf(await gm.callTool({ name: 'update_notes', arguments: { notes: '門を越えた' } }))).toEqual({
        kept: 5,
      });
      await until(() => tab.heard.some((message) => (message as { type?: string })?.type === 'gm.notes'));
      expect(tab.heard.filter((message) => (message as { type?: string })?.type === 'call')).toEqual([]);
    });

    it('refuses the notebook to an AI while the game master is not started', async () => {
      await connectTab();

      expect(await gm.callTool({ name: 'update_notes', arguments: { notes: '勝手なメモ' } })).toMatchObject({
        isError: true,
        content: [{ type: 'text', text: expect.stringMatching(/^not_allowed: The game master is not started/) }],
      });
    });

    it('counts the AI as there once it waits for the turn, and not for calling a tool alone', async () => {
      const tab = await connectTab();
      tab.answer = () => ({ ok: true });
      expect(desk.status().attended).toBe(false);

      await gm.callTool({ name: 'get_room', arguments: {} });
      expect(desk.status().attended).toBe(false);

      const waiting = gm.callTool({ name: 'wait_for_turn', arguments: { timeout_seconds: 1 } });
      await until(() => desk.status().attended === true);
      await waiting;
    });

    it('hands the AI the prompt and the guide to being the game master of the panel', async () => {
      const { prompts } = await gm.listPrompts();
      expect(prompts.map((prompt) => prompt.name)).toEqual(['run_session', 'run_ai_gm']);
      const prompt = await gm.getPrompt({ name: 'run_ai_gm' });
      expect(prompt.messages[0].content).toEqual({ type: 'text', text: RUN_AI_GM_PROMPT });

      const { resources } = await gm.listResources();
      expect(resources.map((resource) => resource.uri)).toEqual([
        RUN_SESSION_GUIDE_URI,
        RUN_AI_GM_GUIDE_URI,
        CHAT_SYNTAX_GUIDE_URI,
      ]);
      const guide = await gm.readResource({ uri: RUN_AI_GM_GUIDE_URI });
      expect(guide.contents[0]).toMatchObject({ text: RUN_AI_GM_PROMPT });
    });
  });
});
