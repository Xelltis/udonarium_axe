import { type ChildProcess, spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, test } from '@playwright/test';

import { BRIDGE, buildBridgeIfStale } from './ai-bridge';
import { becomeGm, openFabMenu, putAwayTutorial, waitAppReady } from './helpers';

/** The key the bridge is started with, which only the stand-in for the API ever sees. */
const KEY = 'sk-ant-e2e-not-a-real-key';

/** A request the stand-in for the Claude API was sent, as it read it. */
interface Sent {
  readonly key: string | undefined;
  readonly body: {
    readonly model: string;
    readonly messages: readonly { readonly role: string; readonly content: unknown }[];
  };
}

/** What the stand-in for a provider of the chat completions API was sent. */
interface ChatSent {
  readonly key: string | undefined;
  readonly body: {
    readonly model: string;
    readonly messages: readonly { readonly role: string; readonly content: unknown }[];
    readonly tools?: readonly { readonly function: { readonly name: string } }[];
  };
}

type Block =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool_use'; readonly id: string; readonly name: string; readonly input: unknown };

/** Streams a response as the Messages API does, in server-sent events. */
function stream(res: ServerResponse, model: string, blocks: readonly Block[], stop: string): void {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('message_start', {
    type: 'message_start',
    message: {
      id: `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 2000, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  });
  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      send('content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      send('content_block_delta', {
        type: 'content_block_delta',
        index,
        delta: { type: 'text_delta', text: block.text },
      });
    } else {
      send('content_block_start', {
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: block.id, name: block.name, input: {} },
      });
      send('content_block_delta', {
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) },
      });
    }
    send('content_block_stop', { type: 'content_block_stop', index });
  });
  send('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: stop, stop_sequence: null },
    usage: { output_tokens: 80 },
  });
  send('message_stop', { type: 'message_stop' });
  res.end();
}

/**
 * A stand-in for the Claude API, so that nothing is charged: it answers a turn by saying one line with
 * send_chat, and the answer to that call by ending the turn with a word aside. The line opens the
 * session at first, and after that is the word the person at the seat put to the game master.
 */
function fakeClaude(): Promise<{ server: Server; port: number; sent: Sent[] }> {
  const sent: Sent[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (req.method !== 'POST' || !req.url?.startsWith('/v1/messages')) {
        res.writeHead(404).end();
        return;
      }
      const body = JSON.parse(raw) as Sent['body'];
      // The SDK sends the key as a bearer token; x-api-key is the API's other way of taking it.
      const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
      sent.push({ key: bearer ?? (req.headers['x-api-key'] as string | undefined), body });
      const last = body.messages.at(-1)!;
      const answered = Array.isArray(last.content) && JSON.stringify(last.content).includes('tool_result');
      if (answered) {
        stream(res, body.model, [{ type: 'text', text: '場面を進めました' }], 'end_turn');
        return;
      }
      const direction = /The person at your seat says: (.+)/.exec(JSON.stringify(body.messages))?.[1];
      const line = direction ? `茂みからゴブリンが現れた！` : 'ようこそ、冒険者たち';
      stream(
        res,
        body.model,
        [{ type: 'tool_use', id: `toolu_${sent.length}`, name: 'send_chat', input: { text: line } }],
        'tool_use'
      );
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port, sent }))
  );
}

/**
 * A stand-in for a provider that speaks the chat completions API, as OpenAI and a model served at hand
 * do: it answers a turn by calling send_chat, and the answer to that call by ending the turn with a
 * word aside.
 */
function fakeChatCompletions(): Promise<{ server: Server; port: number; sent: ChatSent[] }> {
  const sent: ChatSent[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        res.writeHead(404).end();
        return;
      }
      const body = JSON.parse(raw) as ChatSent['body'];
      sent.push({ key: /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1], body });
      const answered = body.messages.at(-1)?.role === 'tool';
      const direction = /The person at your seat says: (.+)/.exec(JSON.stringify(body.messages))?.[1];
      const message = answered
        ? { role: 'assistant', content: '場面を進めました' }
        : {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: `call_${sent.length}`,
                type: 'function',
                function: {
                  name: 'send_chat',
                  arguments: JSON.stringify({ text: direction ? '霧の中から船が現れた！' : '港へようこそ' }),
                },
              },
            ],
          };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'chatcmpl-test',
          choices: [{ index: 0, finish_reason: answered ? 'stop' : 'tool_calls', message }],
          usage: { prompt_tokens: 1500, completion_tokens: 80 },
        })
      );
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port, sent }))
  );
}

test.describe('the AI game master', () => {
  test.beforeAll(() => {
    buildBridgeIfStale();
  });

  test('runs from its panel with the key kept in the bridge: opens the session, goes on when asked, and stops', async ({
    page,
  }, info) => {
    // A port of each worker's own, so that the workers' bridges do not take one another's.
    const port = 47720 + info.parallelIndex;
    const claude = await fakeClaude();
    let bridge: ChildProcess | null = null;
    try {
      bridge = spawn('node', [BRIDGE, 'gm', '--port', String(port)], {
        env: { ...process.env, ANTHROPIC_API_KEY: KEY, ANTHROPIC_BASE_URL: `http://127.0.0.1:${claude.port}` },
        stdio: 'ignore',
      });
      await page.addInitScript(
        (linkPort) => localStorage.setItem('axe.ai-link', JSON.stringify({ port: linkPort, scope: 'read' })),
        port
      );
      await waitAppReady(page);
      await becomeGm(page);
      await putAwayTutorial(page);
      await openFabMenu(page);
      await page.getByTestId('fab-ai-link').click();
      await page.getByTestId('ai-link-tab-gm').click();
      const panel = page.locator('ai-gm-panel');
      const state = panel.getByTestId('ai-gm-state');
      await expect(state).toHaveAttribute('data-state', 'unlinked');

      await page.getByTestId('ai-link-toggle').click();
      await expect(state).toHaveAttribute('data-state', 'off', { timeout: 15000 });
      await panel.getByTestId('ai-gm-instructions').fill('舞台は港町。口調は穏やかに');
      await panel.getByTestId('ai-gm-instructions').blur();

      // Started, it opens the session at once, speaking for everyone to see, marked as the AI's.
      await panel.getByTestId('ai-gm-start').click();
      const opened = page.locator('chat-tab chat-message').filter({ hasText: 'ようこそ、冒険者たち' });
      await expect(opened.getByTestId('chat-message-ai')).toBeAttached({ timeout: 15000 });
      await expect(panel.getByTestId('ai-gm-aside').first()).toContainText('場面を進めました');
      await expect(state).toHaveAttribute('data-state', 'waiting');
      await expect(panel.getByTestId('ai-gm-spent')).toContainText('$');

      // Asked to go on with a word, it takes its turn at once, the word reaching it alone.
      await panel.getByTestId('ai-gm-direction').fill('ゴブリンを出して');
      await panel.getByTestId('ai-gm-nudge').click();
      const goblin = page.locator('chat-tab chat-message').filter({ hasText: '茂みからゴブリンが現れた！' });
      await expect(goblin.getByTestId('chat-message-ai')).toBeAttached({ timeout: 15000 });
      await expect(page.locator('chat-tab chat-message').filter({ hasText: 'ゴブリンを出して' })).toHaveCount(0);

      await panel.getByTestId('ai-gm-stop').click();
      await expect(state).toHaveAttribute('data-state', 'asked');
      await expect(panel.getByTestId('ai-gm-start')).toBeVisible();

      // The key reached the API from the bridge alone, and the page never held it.
      expect(claude.sent.length).toBeGreaterThanOrEqual(4);
      expect(claude.sent.every((request) => request.key === KEY)).toBe(true);
      const opening = JSON.stringify(claude.sent[0].body);
      expect(opening).toContain('舞台は港町');
      expect(claude.sent[0].body.model).toBe('claude-opus-5-5');
      const asked = claude.sent.find((request) => JSON.stringify(request.body).includes('ゴブリンを出して'))!;
      expect(asked.body.messages.at(-1)).toMatchObject({ role: 'system' });
      const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
      expect(stored).not.toContain(KEY);

      // Closed, let go of and linked again from the half of the link, the panel turns back to the half the
      // game master is worked from.
      await page.locator('ui-panel').filter({ has: panel }).getByTestId('panel-close').dispatchEvent('click');
      await expect(panel).toHaveCount(0);
      await openFabMenu(page);
      await page.getByTestId('fab-ai-link').click();
      await page.getByTestId('ai-link-tab-link').click();
      const link = page.locator('ai-link-panel');
      await expect(link.getByTestId('ai-link-history')).toBeVisible();
      await link.getByTestId('ai-link-toggle').click();
      await expect(link.getByTestId('ai-link-state')).toHaveAttribute('data-state', 'idle');
      await link.getByTestId('ai-link-toggle').click();
      await expect(page.locator('ai-gm-panel').getByTestId('ai-gm-state')).toHaveAttribute('data-state', 'asked', {
        timeout: 15000,
      });
    } finally {
      bridge?.kill();
      claude.server.close();
    }
  });

  test('is taken by an AI app connected over MCP, with no key: started, asked to go on and stopped from the panel', async ({
    page,
  }, info) => {
    const port = 47780 + info.parallelIndex;
    const client = new Client({ name: 'e2e', version: '1' });
    await client.connect(
      new StdioClientTransport({ command: 'node', args: [BRIDGE, '--port', String(port)], stderr: 'ignore' })
    );
    const answerOf = (result: Awaited<ReturnType<Client['callTool']>>): Record<string, unknown> => {
      const [first] = result.content as { type: string; text: string }[];
      expect(result.isError, first?.text).toBeFalsy();
      return JSON.parse(first.text) as Record<string, unknown>;
    };
    const waitForTurn = () => client.callTool({ name: 'wait_for_turn', arguments: { timeout_seconds: 20 } });
    try {
      await page.addInitScript(
        (linkPort) => localStorage.setItem('axe.ai-link', JSON.stringify({ port: linkPort, scope: 'read' })),
        port
      );
      await waitAppReady(page);
      await becomeGm(page);
      await putAwayTutorial(page);
      await openFabMenu(page);
      await page.getByTestId('fab-ai-link').click();
      await page.getByTestId('ai-link-tab-gm').click();
      const panel = page.locator('ai-gm-panel');
      const state = panel.getByTestId('ai-gm-state');
      await page.getByTestId('ai-link-toggle').click();
      await expect(state).toHaveAttribute('data-state', 'off', { timeout: 15000 });

      // The model and the spending are the AI app's: the panel leaves them out, and says how to begin.
      await expect(panel.getByTestId('ai-gm-mcp-hint')).toBeVisible();
      await expect(panel.getByTestId('ai-gm-budget')).toHaveCount(0);
      await panel.getByTestId('ai-gm-instructions').fill('舞台は港町。口調は穏やかに');
      await panel.getByTestId('ai-gm-instructions').blur();

      // The AI waits for its turn; started, it is handed the opening one with the instructions.
      const opening = waitForTurn();
      await panel.getByTestId('ai-gm-start').click();
      expect(answerOf(await opening)).toMatchObject({ turn: true, instructions: '舞台は港町。口調は穏やかに' });
      await expect(state).toHaveAttribute('data-state', 'thinking');

      // It speaks for everyone to see, marked as the AI's, and keeps its notebook where the panel shows it.
      answerOf(await client.callTool({ name: 'send_chat', arguments: { text: 'ようこそ、冒険者たち' } }));
      const opened = page.locator('chat-tab chat-message').filter({ hasText: 'ようこそ、冒険者たち' });
      await expect(opened.getByTestId('chat-message-ai')).toBeAttached({ timeout: 15000 });
      answerOf(await client.callTool({ name: 'update_notes', arguments: { notes: '一行は港に着いた' } }));
      await expect(panel.getByTestId('ai-gm-notes')).toHaveValue('一行は港に着いた');

      // Waiting again ends its turn. Asked to go on with a word, it is handed the turn with the word.
      const next = waitForTurn();
      await expect(state).toHaveAttribute('data-state', 'waiting');
      await panel.getByTestId('ai-gm-direction').fill('ゴブリンを出して');
      await panel.getByTestId('ai-gm-nudge').click();
      const turn = answerOf(await next);
      expect(turn).toMatchObject({ turn: true, direction: 'ゴブリンを出して' });
      expect(turn).not.toHaveProperty('instructions');

      // Stopped from the panel, the AI waiting is told so.
      const last = waitForTurn();
      await panel.getByTestId('ai-gm-stop').click();
      expect(answerOf(await last)).toMatchObject({ turn: false, running: false });
      await expect(state).toHaveAttribute('data-state', 'asked');
    } finally {
      await client.close();
    }
  });

  test('runs on another provider through the chat completions API, its use counted in tokens', async ({
    page,
  }, info) => {
    const port = 47760 + info.parallelIndex;
    const provider = await fakeChatCompletions();
    let bridge: ChildProcess | null = null;
    try {
      bridge = spawn(
        'node',
        [
          BRIDGE,
          'gm',
          '--port',
          String(port),
          '--provider',
          'openai',
          '--base-url',
          `http://127.0.0.1:${provider.port}/v1`,
          '--model',
          'model-at-hand',
        ],
        { env: { ...process.env, AXE_GM_API_KEY: KEY }, stdio: 'ignore' }
      );
      await page.addInitScript(
        (linkPort) => localStorage.setItem('axe.ai-link', JSON.stringify({ port: linkPort, scope: 'read' })),
        port
      );
      await waitAppReady(page);
      await becomeGm(page);
      await putAwayTutorial(page);
      await openFabMenu(page);
      await page.getByTestId('fab-ai-link').click();
      await page.getByTestId('ai-link-tab-gm').click();
      const panel = page.locator('ai-gm-panel');
      const state = panel.getByTestId('ai-gm-state');
      await page.getByTestId('ai-link-toggle').click();
      await expect(state).toHaveAttribute('data-state', 'off', { timeout: 15000 });

      // The model kept here is Claude's, which this bridge does not run: it is said so, and another is chosen.
      await expect(panel.getByTestId('ai-gm-model-not-run')).toBeVisible();
      await expect(panel.getByTestId('ai-gm-start')).toBeDisabled();
      await panel.getByTestId('ai-gm-model-model-at-hand').check();
      await expect(panel.getByTestId('ai-gm-model-not-run')).toHaveCount(0);

      await panel.getByTestId('ai-gm-start').click();
      const opened = page.locator('chat-tab chat-message').filter({ hasText: '港へようこそ' });
      await expect(opened.getByTestId('chat-message-ai')).toBeAttached({ timeout: 15000 });
      await expect(panel.getByTestId('ai-gm-aside').first()).toContainText('場面を進めました');
      await expect(state).toHaveAttribute('data-state', 'waiting');
      // No price was told for the model, so what it used is told in tokens.
      await expect(panel.getByTestId('ai-gm-spent')).toContainText('3,160');
      await expect(panel.getByTestId('ai-gm-spent')).not.toContainText('$');

      await panel.getByTestId('ai-gm-direction').fill('船を出して');
      await panel.getByTestId('ai-gm-nudge').click();
      const ship = page.locator('chat-tab chat-message').filter({ hasText: '霧の中から船が現れた！' });
      await expect(ship.getByTestId('chat-message-ai')).toBeAttached({ timeout: 15000 });

      await panel.getByTestId('ai-gm-stop').click();
      await expect(state).toHaveAttribute('data-state', 'asked');

      expect(provider.sent.length).toBeGreaterThanOrEqual(4);
      expect(provider.sent.every((request) => request.key === KEY)).toBe(true);
      expect(provider.sent[0].body.model).toBe('model-at-hand');
      expect(provider.sent[0].body.tools?.some((tool) => tool.function.name === 'send_chat')).toBe(true);
      const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
      expect(stored).not.toContain(KEY);
    } finally {
      bridge?.kill();
      provider.server.close();
    }
  });
});
