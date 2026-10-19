import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

test.describe('the edit history of a line', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('keeps the earlier wording when a line is edited, and opens how it changed from the edited mark', async ({
    page,
  }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.fill('こんばんわ');
    await textarea.press('Enter');
    await expect(textarea).toHaveValue('');

    // Editing changes the text, so the line is held as the last one rather than by its text.
    const line = page.locator('chat-tab chat-message').last();
    await expect(line).toContainText('こんばんわ');
    for (const next of ['こんばんは', 'こんばんは！']) {
      await line.locator('.msg-text').hover();
      await line.getByTestId('chat-message-action-edit').click();
      const editor = line.locator('textarea');
      await editor.fill(next);
      await editor.press('Enter');
      await expect(editor).toHaveCount(0);
    }

    await line.getByTestId('chat-message-history-toggle').click();
    const versions = line.getByTestId('chat-message-history-version');
    await expect(versions).toHaveCount(3);
    await expect(versions.nth(0)).toContainText('最初の発言');
    await expect(versions.nth(0)).toContainText('こんばんわ');
    await expect(versions.nth(2)).toContainText('現在');
    await expect(versions.nth(2)).toContainText('こんばんは！');
  });
});
