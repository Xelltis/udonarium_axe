import {
  AGENT_INSTRUCTIONS,
  CHAT_SYNTAX_GUIDE,
  CHAT_SYNTAX_GUIDE_URI,
  RUN_SESSION_GUIDE_URI,
  RUN_SESSION_PROMPT,
  RUN_SESSION_PROMPT_NAME,
} from '@axe/core/agent/agent-guide';
import { checkAgentInput } from '@axe/core/agent/agent-schema';
import { AGENT_TOOLS, agentToolOf } from '@axe/core/agent/agent-tools';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  type CallToolResult,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import type { TabLink } from './tab-link';

/** How long a call is given before it is given up, beyond the time a wait asks for. */
const CALL_TIMEOUT_MS = 30_000;
const WAIT_MARGIN_MS = 10_000;
const DEFAULT_WAIT_SECONDS = 25;

function failure(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/**
 * The MCP server an AI talks to: the tools as Axe defines them, each call handed to the connected
 * tab and its answer handed back as JSON text, and the guide to running a session and to the chat
 * syntax. It holds none of the game itself.
 */
export function createMcpServer(link: TabLink, version: string): Server {
  const server = new Server(
    { name: 'udonarium-axe', title: 'Udonarium Axe', version },
    { capabilities: { tools: {}, prompts: {}, resources: {} }, instructions: AGENT_INSTRUCTIONS }
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: AGENT_TOOLS.map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: { ...tool.input },
      annotations: {
        title: tool.title,
        readOnlyHint: tool.access === 'read',
        destructiveHint: tool.destructive === true,
        openWorldHint: false,
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request, extra): Promise<CallToolResult> => {
    const tool = agentToolOf(request.params.name);
    if (!tool) return failure(`unknown_tool: There is no tool named ${request.params.name}.`);
    const args = request.params.arguments ?? {};
    const problems = checkAgentInput(tool.input, args);
    if (problems.length > 0) return failure(`invalid_input: ${problems.join('; ')}`);
    const wait = tool.name === 'wait_for_events' ? Number(args['timeout_seconds'] ?? DEFAULT_WAIT_SECONDS) : 0;
    const timeout = wait > 0 ? wait * 1000 + WAIT_MARGIN_MS : CALL_TIMEOUT_MS;
    const outcome = await link.call(tool.name, args, timeout, extra.signal);
    if (!outcome.ok) return failure(`${outcome.error.code}: ${outcome.error.message}`);
    return { content: [{ type: 'text', text: JSON.stringify(outcome.value ?? null) }] };
  });

  server.setRequestHandler(ListPromptsRequestSchema, () => ({
    prompts: [
      {
        name: RUN_SESSION_PROMPT_NAME,
        title: 'Run a session as the game master',
        description: 'Sets the AI to run a session on the connected table as its game master.',
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, (request) => {
    if (request.params.name !== RUN_SESSION_PROMPT_NAME)
      throw new Error(`There is no prompt named ${request.params.name}.`);
    return {
      description: 'Run a session as the game master.',
      messages: [{ role: 'user' as const, content: { type: 'text' as const, text: RUN_SESSION_PROMPT } }],
    };
  });

  server.setRequestHandler(ListResourcesRequestSchema, () => ({
    resources: [
      {
        uri: RUN_SESSION_GUIDE_URI,
        name: 'run-session',
        title: 'Running a session on Udonarium Axe',
        description: 'How to run a session as the game master through these tools.',
        mimeType: 'text/markdown',
      },
      {
        uri: CHAT_SYNTAX_GUIDE_URI,
        name: 'chat-syntax',
        title: 'Chat syntax of Udonarium Axe',
        description: 'Dice, resources, buffs, turns, effects and cut-ins, as a chat line reads them.',
        mimeType: 'text/markdown',
      },
    ],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, (request) => {
    const guides: Record<string, string> = {
      [RUN_SESSION_GUIDE_URI]: RUN_SESSION_PROMPT,
      [CHAT_SYNTAX_GUIDE_URI]: CHAT_SYNTAX_GUIDE,
    };
    const text = guides[request.params.uri];
    if (text === undefined) throw new Error(`There is no resource at ${request.params.uri}.`);
    return { contents: [{ uri: request.params.uri, mimeType: 'text/markdown', text }] };
  });

  return server;
}
