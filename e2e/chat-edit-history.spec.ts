import { expect, test } from '@playwright/test';

import { waitAppReady } from './helpers';

test.describe('発言の編集履歴', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('編集すると前の文面が残り、編集済の印から移り変わりを開けること', async ({ page }) => {
    const textarea = page.locator('textarea.chat-input');
    await textarea.fill('こんばんわ');
    await textarea.press('Enter');
    await expect(textarea).toHaveValue('');

    // 編集すると文面が変わるので、文面ではなく最後の発言として掴む。
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
