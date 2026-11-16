import { expect, test } from '@playwright/test';

import { openChatSettingsMenuItem, say, waitAppReady } from './helpers';

test.describe('deleting a line', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('keeps a deleted line in the log with a mark, and leaves it out once the log is set not to include it', async ({
    page,
  }) => {
    await say(page, '残る発言');
    await say(page, '消す発言');
    const line = page.locator('chat-tab chat-message').filter({ hasText: '消す発言' });
    await line.getByTestId('chat-message-text').hover();
    await line.getByTestId('chat-message-action-more').click();
    await page
      .locator('context-menu li')
      .filter({ hasText: /^\s*削除\s*$/ })
      .click();
    await page.locator('confirm-dialog').getByRole('button', { name: '削除' }).click();
    await expect(line).toHaveCount(0);

    await openChatSettingsMenuItem(page, 'タブ設定');
    await page.getByTestId('chat-log-preview-open').click();
    const log = page.frameLocator('[data-testid="chat-log-preview-frame"]').locator('body');
    await expect(log).toContainText('消す発言 (削除済)');

    await page.getByTestId('chat-log-preview-omit-deleted').check();
    await expect(log).toContainText('残る発言');
    await expect(log).not.toContainText('消す発言');
  });
});
