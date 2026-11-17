import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, test } from '@playwright/test';

import { BRIDGE, buildBridgeIfStale } from './ai-bridge';
import { openFabMenu, putAwayTutorial, waitAppReady } from './helpers';

/** What a tool answered, read back from its JSON text. */
function answerOf(result: Awaited<ReturnType<Client['callTool']>>): Record<string, unknown> {
  const [first] = result.content as { type: string; text: string }[];
  expect(result.isError, first?.text).toBeFalsy();
  return JSON.parse(first.text) as Record<string, unknown>;
}

test.describe('linking an AI', () => {
  test.beforeAll(() => {
    buildBridgeIfStale();
  });

  test('lets an AI started with the bridge speak in chat as the seat, marked as the AI’s, and move a piece', async ({
    page,
  }, info) => {
    // A port of each worker's own, so that the workers' bridges do not take one another's.
    const port = 47700 + info.parallelIndex;
    const client = new Client({ name: 'e2e', version: '1' });
    await client.connect(
      new StdioClientTransport({ command: 'node', args: [BRIDGE, '--port', String(port)], stderr: 'ignore' })
    );
    try {
      await waitAppReady(page);
      await putAwayTutorial(page);
      await openFabMenu(page);
      await page.getByTestId('fab-ai-link').click();
      const panel = page.locator('ai-link-panel');
      await expect(panel.getByTestId('ai-link-state')).toHaveAttribute('data-state', 'idle');

      // Read only at first: the AI may look, and is refused a line.
      const portInput = panel.getByTestId('ai-link-port');
      await portInput.fill(String(port));
      await portInput.press('Tab');
      await panel.getByTestId('ai-link-toggle').click();
      await expect(panel.getByTestId('ai-link-state')).toHaveAttribute('data-state', 'connected', { timeout: 15000 });
      expect(answerOf(await client.callTool({ name: 'get_room', arguments: {} }))).toMatchObject({
        seat: { may_change: true },
      });
      const refused = await client.callTool({ name: 'send_chat', arguments: { text: 'まだ話せない' } });
      expect(refused.isError).toBe(true);

      // Let it act, and it speaks for everyone to see, marked as the AI's.
      await panel.getByTestId('ai-link-scope-write').check();
      const said = answerOf(await client.callTool({ name: 'send_chat', arguments: { text: 'ようこそ、冒険者たち' } }));
      expect(said).toMatchObject({ lines: [{ text: 'ようこそ、冒険者たち', by_ai: true }] });
      await expect(page.getByTestId('chat-message-ai').first()).toBeAttached({ timeout: 10000 });

      const pieces = answerOf(await client.callTool({ name: 'list_pieces', arguments: {} })) as unknown as {
        name: string;
        square: { col: number; row: number };
      }[];
      const [first] = pieces;
      const target = { col: first.square.col + 1, row: first.square.row };
      expect(
        answerOf(await client.callTool({ name: 'move_piece', arguments: { piece: first.name, ...target } }))
      ).toMatchObject({ square: target });

      await expect(panel.getByTestId('ai-link-history-entry')).toHaveCount(3);
      await panel.getByTestId('ai-link-toggle').click();
      await expect(panel.getByTestId('ai-link-state')).toHaveAttribute('data-state', 'idle');
    } finally {
      await client.close();
    }
  });
});
