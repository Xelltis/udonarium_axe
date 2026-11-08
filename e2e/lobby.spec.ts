import { expect, test } from '@playwright/test';

import { triesToConnect, waitAppReady } from './helpers';

/**
 * The connection panel is where every session starts. The suite runs against a backend that
 * answers nothing on purpose, so this stops at what the browser owns: the name written in the
 * panel reaching the chat, which are two panels apart.
 */
test.describe('the connection panel and the lobby', () => {
  test.beforeEach(async ({ page }) => {
    await triesToConnect(page);
    await waitAppReady(page);
    await expect(page.locator('peer-menu')).toBeVisible({ timeout: 10000 });
  });

  test('shows a changed nickname as the speaker name in the chat', async ({ page }) => {
    const nickname = page.locator('peer-menu input[name="peer-name"]');
    await expect(nickname).toBeVisible();
    await nickname.fill('語り部');

    // The speaker picker shows one's own name followed by 「（あなた）」.
    await expect(page.locator('chat-input')).toContainText('語り部', { timeout: 10000 });
  });
});
