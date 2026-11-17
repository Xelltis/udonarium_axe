import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { expect, test } from '@playwright/test';

import { becomeGm, openFabMenu, putAwayTutorial, waitAppReady } from './helpers';

/** The bridge as a release carries it, built from the sources where it has not been yet. */
const BRIDGE = 'tools/axe-mcp/dist/axe-mcp.mjs';
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

test.describe('the AI game master', () => {
  test.beforeAll(() => {
    if (!existsSync(BRIDGE)) execFileSync('node', ['tools/axe-mcp/build.mjs'], { stdio: 'inherit' });
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
      await page.getByTestId('fab-ai-gm').click();
      const panel = page.locator('ai-gm-panel');
      const state = panel.getByTestId('ai-gm-state');
      await expect(state).toHaveAttribute('data-state', 'unlinked');

      await panel.getByTestId('ai-gm-link-toggle').click();
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
    } finally {
      bridge?.kill();
      claude.server.close();
    }
  });
});
