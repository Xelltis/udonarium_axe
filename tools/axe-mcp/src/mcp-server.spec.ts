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
});
