import { expect, Page, test } from '@playwright/test';

import { waitAppReady } from './helpers';

async function say(page: Page, text: string) {
  const textarea = page.locator('textarea.chat-input');
  await textarea.fill(text);
  await textarea.press('Enter');
  await expect(textarea).toHaveValue('');
}

test.describe('発言の削除', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('確かめてから削除すると、自分の画面からも消えること', async ({ page }) => {
    await say(page, 'うっかり書いた発言');
    const line = page.locator('chat-tab chat-message').filter({ hasText: 'うっかり書いた発言' });

    await line.locator('.msg-text').hover();
    await line.getByTestId('chat-message-pseudo-delete').click();
    const dialog = page.locator('confirm-dialog');
    await expect(dialog).toContainText('元に戻せません');
    await dialog.getByRole('button', { name: '削除' }).click();

    await expect(line).toHaveCount(0);
  });

  test('確認でやめると、発言はそのまま残ること', async ({ page }) => {
    await say(page, '残しておく発言');
    const line = page.locator('chat-tab chat-message').filter({ hasText: '残しておく発言' });

    await line.locator('.msg-text').hover();
    await line.getByTestId('chat-message-pseudo-delete').click();
    await page.locator('confirm-dialog').getByRole('button', { name: 'キャンセル' }).click();

    await expect(page.locator('confirm-dialog')).toHaveCount(0);
    await expect(line).toHaveCount(1);
  });
});
