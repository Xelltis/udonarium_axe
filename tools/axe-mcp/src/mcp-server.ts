import {
  GM_DESK_TOOLS,
  GM_NOTES_TOOL_NAME,
  GM_TURN_TOOL_NAME,
  RUN_AI_GM_GUIDE_URI,
  RUN_AI_GM_PROMPT,
  RUN_AI_GM_PROMPT_NAME,
} from '@axe/core/agent/agent-gm';
import {
  AGENT_INSTRUCTIONS,
  CHAT_SYNTAX_GUIDE,
  CHAT_SYNTAX_GUIDE_URI,
  RUN_SESSION_GUIDE_URI,
  RUN_SESSION_PROMPT,
  RUN_SESSION_PROMPT_NAME,
} from '@axe/core/agent/agent-guide';
import { checkAgentInput } from '@axe/core/agent/agent-schema';
import { AGENT_TOOLS, type AgentToolDefinition } from '@axe/core/agent/agent-tools';
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

import type { TurnDesk } from './gm/turn-desk';
import type { TabLink } from './tab-link';

/** How long a call is given before it is given up, beyond the time a wait asks for. */
const CALL_TIMEOUT_MS = 30_000;
const WAIT_MARGIN_MS = 10_000;
const DEFAULT_WAIT_SECONDS = 25;

function failure(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

function answer(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value ?? null) }] };
}

/** How long the tool asks to wait, in milliseconds, 25 seconds where it does not say. */
function waitOf(args: Readonly<Record<string, unknown>>): number {
  return Number(args['timeout_seconds'] ?? DEFAULT_WAIT_SECONDS) * 1000;
}

/**
 * The MCP server an AI talks to: the tools as Axe defines them, each call handed to the connected
 * tab and its answer handed back as JSON text, and the guides to running a session and to the chat
 * syntax. It holds none of the game itself. Given a desk, it also lets the AI be the game master the
 * AI GM panel runs: waiting for its turn and keeping its notebook are answered by the desk, and every
 * call shows the desk that the AI is there. Each server is one conversation to the desk, which tells
 * it the instructions and the notebook it has not had; taking the prompt or the guide begins one anew.
 */
export function createMcpServer(link: TabLink, version: string, desk?: TurnDesk): Server {
  const tools: readonly AgentToolDefinition[] = desk ? [...AGENT_TOOLS, ...GM_DESK_TOOLS] : AGENT_TOOLS;
  const prompts = [
    {
      name: RUN_SESSION_PROMPT_NAME,
      title: 'Run a session as the game master',
      description: 'Sets the AI to run a session on the connected table as its game master.',
      text: RUN_SESSION_PROMPT,
    },
    ...(desk
      ? [
          {
            name: RUN_AI_GM_PROMPT_NAME,
            title: 'Be the AI game master of the AI GM panel',
            description:
              'Sets the AI to be the game master run from the AI GM panel of Axe: the person at the seat starts and ' +
              'stops it there, and chooses when it is woken and which chat tabs it hears.',
            text: RUN_AI_GM_PROMPT,
          },
        ]
      : []),
  ];
  const server = new Server(
    { name: 'udonarium-axe', title: 'Udonarium Axe', version },
    { capabilities: { tools: {}, prompts: {}, resources: {} }, instructions: AGENT_INSTRUCTIONS }
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools.map((tool) => ({
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
    const tool = tools.find((each) => each.name === request.params.name);
    if (!tool) return failure(`unknown_tool: There is no tool named ${request.params.name}.`);
    const args = request.params.arguments ?? {};
    const problems = checkAgentInput(tool.input, args);
    if (problems.length > 0) return failure(`invalid_input: ${problems.join('; ')}`);
    desk?.noteCall(server);
    if (desk && tool.name === GM_TURN_TOOL_NAME) {
      if (args['again'] === true) desk.beginAnew(server);
      return answer(await desk.waitForTurn(waitOf(args), extra.signal, server));
    }
    if (desk && tool.name === GM_NOTES_TOOL_NAME) {
      const kept = desk.writeNotes(String(args['notes'] ?? ''), server);
      return kept
        ? answer(kept)
        : failure(
            'not_allowed: The game master is not started, and the notebook is kept for it. Wait for a turn first.'
          );
    }
    const timeout = tool.name === 'wait_for_events' ? waitOf(args) + WAIT_MARGIN_MS : CALL_TIMEOUT_MS;
    const outcome = await link.call(tool.name, args, timeout, extra.signal);
    if (!outcome.ok) return failure(`${outcome.error.code}: ${outcome.error.message}`);
    return answer(outcome.value);
  });

  server.setRequestHandler(ListPromptsRequestSchema, () => ({
    prompts: prompts.map(({ name, title, description }) => ({ name, title, description })),
  }));

  server.setRequestHandler(GetPromptRequestSchema, (request) => {
    const prompt = prompts.find((each) => each.name === request.params.name);
    if (!prompt) throw new Error(`There is no prompt named ${request.params.name}.`);
    // A conversation set to be the game master begins here, and has had no instructions yet.
    if (prompt.name === RUN_AI_GM_PROMPT_NAME) desk?.beginAnew(server);
    return {
      description: prompt.title,
      messages: [{ role: 'user' as const, content: { type: 'text' as const, text: prompt.text } }],
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
      ...(desk
        ? [
            {
              uri: RUN_AI_GM_GUIDE_URI,
              name: 'run-ai-gm',
              title: 'Being the AI game master of the AI GM panel',
              description: 'How to be the game master the person at the seat runs from the AI GM panel of Axe.',
              mimeType: 'text/markdown',
            },
          ]
        : []),
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
      ...(desk ? { [RUN_AI_GM_GUIDE_URI]: RUN_AI_GM_PROMPT } : {}),
    };
    const text = guides[request.params.uri];
    if (text === undefined) throw new Error(`There is no resource at ${request.params.uri}.`);
    if (request.params.uri === RUN_AI_GM_GUIDE_URI) desk?.beginAnew(server);
    return { contents: [{ uri: request.params.uri, mimeType: 'text/markdown', text }] };
  });

  return server;
}
