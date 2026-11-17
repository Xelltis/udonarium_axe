import type Anthropic from '@anthropic-ai/sdk';
import { APIError, APIUserAbortError } from '@anthropic-ai/sdk';

import type { GmApi } from './game-master';

/** How a request is sent, so that a stand-in can take the network's place in the specs. */
export type OpenAiFetch = (
  url: string,
  init: {
    readonly method: 'POST';
    readonly headers: Record<string, string>;
    readonly body: string;
    readonly signal: AbortSignal;
  }
) => Promise<{ readonly ok: boolean; readonly status: number; text(): Promise<string> }>;

/** Where a provider that speaks the chat completions API is reached, and the key it asks for, if any. */
export interface OpenAiEndpoint {
  /** The address the API is served under, as `https://api.openai.com/v1`. */
  readonly baseUrl: string;
  /** The key sent as a bearer token, or empty for a server that asks for none, as one run at hand. */
  readonly apiKey: string;
  readonly fetch?: OpenAiFetch;
}

interface ChatToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

type ChatMessage =
  | { readonly role: 'system' | 'user'; readonly content: string }
  | { readonly role: 'assistant'; readonly content: string | null; readonly tool_calls?: ChatToolCall[] }
  | { readonly role: 'tool'; readonly tool_call_id: string; readonly content: string };

function textOfBlocks(content: string | readonly { readonly type: string; readonly text?: string }[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

/**
 * The messages of a conversation as the chat completions API takes them. The system prompt goes first
 * as one message; a word told to the model mid-way goes as a system message where it stands; what the
 * model said and the tools it called make one assistant message; each tool's answer is a message of
 * its own. The model's thinking is left out: no other model reads it.
 */
export function chatMessagesOf(
  system: Anthropic.MessageStreamParams['system'],
  messages: readonly Anthropic.MessageParam[]
): ChatMessage[] {
  const chat: ChatMessage[] = [];
  const opening = system === undefined ? '' : textOfBlocks(system);
  if (opening) chat.push({ role: 'system', content: opening });
  for (const message of messages) {
    const role = message.role as string;
    if (typeof message.content === 'string') {
      if (role === 'assistant') chat.push({ role: 'assistant', content: message.content });
      else chat.push({ role: role === 'system' ? 'system' : 'user', content: message.content });
      continue;
    }
    if (role === 'assistant') {
      const calls: ChatToolCall[] = [];
      for (const block of message.content) {
        if (block.type !== 'tool_use') continue;
        calls.push({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        });
      }
      const said = textOfBlocks(message.content);
      chat.push({ role: 'assistant', content: said || null, ...(calls.length > 0 ? { tool_calls: calls } : {}) });
      continue;
    }
    for (const block of message.content) {
      if (block.type !== 'tool_result') continue;
      const answer = typeof block.content === 'string' ? block.content : textOfBlocks(block.content ?? []);
      chat.push({ role: 'tool', tool_call_id: block.tool_use_id, content: answer });
    }
    const said = textOfBlocks(message.content);
    if (said) chat.push({ role: role === 'system' ? 'system' : 'user', content: said });
  }
  return chat;
}

/** The request the chat completions API takes for a request made of the Claude API: the same model, conversation and tools. */
export function chatRequestOf(body: Anthropic.MessageStreamParams): Record<string, unknown> {
  const tools = (body.tools ?? []).flatMap((tool) =>
    'input_schema' in tool
      ? [
          {
            type: 'function',
            function: { name: tool.name, description: tool.description ?? '', parameters: tool.input_schema },
          },
        ]
      : []
  );
  return {
    model: body.model,
    messages: chatMessagesOf(body.system, body.messages),
    ...(tools.length > 0 ? { tools } : {}),
    stream: false,
  };
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function countOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function inputOf(written: unknown): unknown {
  if (typeof written !== 'string' || written.trim() === '') return {};
  try {
    return recordOf(JSON.parse(written)) ?? {};
  } catch {
    return {};
  }
}

const STOPS: Readonly<Record<string, Anthropic.StopReason>> = {
  tool_calls: 'tool_use',
  function_call: 'tool_use',
  length: 'max_tokens',
  content_filter: 'refusal',
};

/**
 * A response of the chat completions API as the game master reads one of the Claude API: what was
 * said, the tools called with their inputs read from the text they came as (one that cannot be read
 * comes as an empty input, for the tool to refuse), why it stopped, and the tokens used, those read
 * from the provider's cache apart.
 */
export function messageOfChat(raw: unknown, model: string): Anthropic.Message {
  const response = recordOf(raw);
  const choices = Array.isArray(response?.['choices']) ? (response['choices'] as unknown[]) : [];
  const choice = recordOf(choices[0]);
  const message = recordOf(choice?.['message']);
  if (!message) throw new Error('The provider answered with no message.');
  const content: Record<string, unknown>[] = [];
  const said = message['content'];
  if (typeof said === 'string' && said.trim()) content.push({ type: 'text', text: said });
  const calls = Array.isArray(message['tool_calls']) ? (message['tool_calls'] as unknown[]) : [];
  calls.forEach((each, index) => {
    const call = recordOf(each);
    const made = recordOf(call?.['function']);
    if (!call || !made || typeof made['name'] !== 'string') return;
    content.push({
      type: 'tool_use',
      id: typeof call['id'] === 'string' && call['id'] ? call['id'] : `call_${index}`,
      name: made['name'],
      input: inputOf(made['arguments']),
    });
  });
  const usage = recordOf(response?.['usage']);
  const cached = countOf(recordOf(usage?.['prompt_tokens_details'])?.['cached_tokens']);
  const prompt = countOf(usage?.['prompt_tokens']);
  const called = content.some((block) => block['type'] === 'tool_use');
  const stop = STOPS[String(choice?.['finish_reason'])] ?? (called ? 'tool_use' : 'end_turn');
  return {
    id: typeof response?.['id'] === 'string' ? response['id'] : 'chat',
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: stop,
    stop_sequence: null,
    usage: {
      input_tokens: Math.max(0, prompt - cached),
      output_tokens: countOf(usage?.['completion_tokens']),
      cache_read_input_tokens: cached,
      cache_creation_input_tokens: 0,
      cache_creation: null,
    },
  } as unknown as Anthropic.Message;
}

function bodyOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The game master's way to a provider that speaks the chat completions API, as OpenAI and many
 * others do, a model served at hand among them: each request made of the Claude API is sent in that
 * API's shape, and its answer read back as one of the Claude API, so the game master runs on either
 * unchanged. What Claude alone takes, its thinking, the depth it is asked to think to and what to keep
 * cached, is not sent. A refusal comes back as the error the Claude API gives for the same status, so
 * a key that is not taken stops the game master as it does there.
 */
export function openAiApi(endpoint: OpenAiEndpoint): GmApi {
  const send: OpenAiFetch = endpoint.fetch ?? ((url, init) => fetch(url, init));
  const url = `${endpoint.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  return {
    stream: (body, options) => ({
      finalMessage: async () => {
        let response: Awaited<ReturnType<OpenAiFetch>>;
        try {
          response = await send(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(endpoint.apiKey ? { authorization: `Bearer ${endpoint.apiKey}` } : {}),
            },
            body: JSON.stringify(chatRequestOf(body)),
            signal: options.signal,
          });
        } catch (error) {
          if (options.signal.aborted) throw new APIUserAbortError();
          throw error;
        }
        const text = await response.text();
        if (!response.ok) {
          const told = recordOf(recordOf(bodyOf(text))?.['error'])?.['message'];
          const message = typeof told === 'string' ? told : text.slice(0, 300) || `HTTP ${response.status}`;
          throw APIError.generate(response.status, { message }, message, new Headers());
        }
        return messageOfChat(bodyOf(text), body.model);
      },
    }),
  };
}
