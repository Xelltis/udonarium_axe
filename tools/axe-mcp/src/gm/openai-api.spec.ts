import type Anthropic from '@anthropic-ai/sdk';
import { AuthenticationError, BadRequestError } from '@anthropic-ai/sdk';

import { chatMessagesOf, chatRequestOf, messageOfChat, openAiApi, type OpenAiFetch } from './openai-api';

const BODY = {
  model: 'gpt-test',
  max_tokens: 16000,
  thinking: { type: 'adaptive' },
  system: [
    { type: 'text', text: 'You are the game master.' },
    { type: 'text', text: 'The stage is a port town.', cache_control: { type: 'ephemeral' } },
  ],
  tools: [
    {
      name: 'send_chat',
      description: 'Say something in chat.',
      input_schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
  ],
  messages: [
    { role: 'user', content: 'The table as it stands.' },
    {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'a scene first', signature: 'sig' },
        { type: 'text', text: 'I open the scene.' },
        { type: 'tool_use', id: 't1', name: 'send_chat', input: { text: 'ようこそ' } },
      ],
    },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{"lines":1}' }] },
    { role: 'system', content: 'The person at your seat says: go on.' },
  ],
} as unknown as Anthropic.MessageStreamParams;

describe('the chat completions API as the game master speaks it', () => {
  it('sends the system prompt, what was said, the tools called and their answers in that API’s shape, leaving the thinking out', () => {
    expect(chatMessagesOf(BODY.system, BODY.messages)).toEqual([
      { role: 'system', content: 'You are the game master.\nThe stage is a port town.' },
      { role: 'user', content: 'The table as it stands.' },
      {
        role: 'assistant',
        content: 'I open the scene.',
        tool_calls: [{ id: 't1', type: 'function', function: { name: 'send_chat', arguments: '{"text":"ようこそ"}' } }],
      },
      { role: 'tool', tool_call_id: 't1', content: '{"lines":1}' },
      { role: 'system', content: 'The person at your seat says: go on.' },
    ]);
  });

  it('asks for the same model with the tools as functions, and for nothing Claude alone takes', () => {
    const request = chatRequestOf(BODY);

    expect(request).toMatchObject({ model: 'gpt-test', stream: false });
    expect(request['tools']).toEqual([
      {
        type: 'function',
        function: {
          name: 'send_chat',
          description: 'Say something in chat.',
          parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        },
      },
    ]);
    expect(Object.keys(request).sort()).toEqual(['messages', 'model', 'stream', 'tools']);
  });

  it('reads an answer as one of the Claude API: the words, the calls, why it stopped and the tokens used', () => {
    const message = messageOfChat(
      {
        id: 'chatcmpl-1',
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: '酒場から始めます',
              tool_calls: [
                { id: 'c1', type: 'function', function: { name: 'send_chat', arguments: '{"text":"ようこそ"}' } },
                { type: 'function', function: { name: 'roll_dice', arguments: 'not json' } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 1200, completion_tokens: 80, prompt_tokens_details: { cached_tokens: 1000 } },
      },
      'gpt-test'
    );

    expect(message.content).toEqual([
      { type: 'text', text: '酒場から始めます' },
      { type: 'tool_use', id: 'c1', name: 'send_chat', input: { text: 'ようこそ' } },
      { type: 'tool_use', id: 'call_1', name: 'roll_dice', input: {} },
    ]);
    expect(message.stop_reason).toBe('tool_use');
    expect(message.model).toBe('gpt-test');
    expect(message.usage).toMatchObject({ input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 1000 });
  });

  it('reads an answer cut off, one filtered, and one with no usage told', () => {
    const ended = (finish: string) =>
      messageOfChat({ choices: [{ finish_reason: finish, message: { content: 'x' } }] }, 'm');

    expect(ended('length').stop_reason).toBe('max_tokens');
    expect(ended('content_filter').stop_reason).toBe('refusal');
    expect(ended('stop').stop_reason).toBe('end_turn');
    expect(ended('stop').usage).toMatchObject({ input_tokens: 0, output_tokens: 0 });
    expect(() => messageOfChat({ choices: [] }, 'm')).toThrow('The provider answered with no message.');
  });

  it('posts to the address it was given with the key as a bearer token, and with none for a server that asks none', async () => {
    const sent: { url: string; headers: Record<string, string>; body: unknown }[] = [];
    const answer: OpenAiFetch = async (url, init) => {
      sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'はい' } }] }),
      };
    };
    const signal = new AbortController().signal;

    const keyed = openAiApi({ baseUrl: 'https://api.example.com/v1/', apiKey: 'sk-test', fetch: answer });
    const message = await keyed.stream(BODY, { signal }).finalMessage();
    const local = openAiApi({ baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '', fetch: answer });
    await local.stream(BODY, { signal }).finalMessage();

    expect(message.content).toEqual([{ type: 'text', text: 'はい' }]);
    expect(sent[0].url).toBe('https://api.example.com/v1/chat/completions');
    expect(sent[0].headers['authorization']).toBe('Bearer sk-test');
    expect(sent[0].body).toMatchObject({ model: 'gpt-test' });
    expect(sent[1].url).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(sent[1].headers['authorization']).toBeUndefined();
  });

  it('fails as the Claude API does for the same status, so a key not taken stops the game master', async () => {
    const refuse =
      (status: number): OpenAiFetch =>
      async () => ({
        ok: false,
        status,
        text: async () => JSON.stringify({ error: { message: 'Incorrect API key provided.' } }),
      });
    const signal = new AbortController().signal;
    const failing = (status: number) =>
      openAiApi({ baseUrl: 'https://api.example.com/v1', apiKey: 'bad', fetch: refuse(status) })
        .stream(BODY, { signal })
        .finalMessage();

    await expect(failing(401)).rejects.toBeInstanceOf(AuthenticationError);
    await expect(failing(401)).rejects.toThrow('Incorrect API key provided.');
    await expect(failing(400)).rejects.toBeInstanceOf(BadRequestError);
  });
});
