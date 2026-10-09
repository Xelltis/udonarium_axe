import { expect, Page, test } from '@playwright/test';

import { openChatSettingsMenuItem, waitAppReady } from './helpers';

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

  test('ツールバーの削除ボタンから、確かめてから削除すると、自分の画面からも消えること', async ({ page }) => {
    await say(page, 'うっかり書いた発言');
    const line = page.locator('chat-tab chat-message').filter({ hasText: 'うっかり書いた発言' });

    await line.locator('.msg-text').hover();
    await line.getByTestId('chat-message-action-delete').click();
    const dialog = page.locator('confirm-dialog');
    await expect(dialog).toContainText('元に戻せません');
    await dialog.getByRole('button', { name: '削除' }).click();

    await expect(line).toHaveCount(0);
  });

  test('メニューの削除から、確認でやめると、発言はそのまま残ること', async ({ page }) => {
    await say(page, '残しておく発言');
    const line = page.locator('chat-tab chat-message').filter({ hasText: '残しておく発言' });

    await line.locator('.msg-text').hover();
    await line.getByTestId('chat-message-action-more').click();
    await page
      .locator('context-menu li')
      .filter({ hasText: /^\s*削除\s*$/ })
      .click();
    await page.locator('confirm-dialog').getByRole('button', { name: 'キャンセル' }).click();

    await expect(page.locator('confirm-dialog')).toHaveCount(0);
    await expect(line).toHaveCount(1);
  });

  test('削除した発言はログに印付きで残り、出力しない設定にすると外れること', async ({ page }) => {
    await say(page, '残る発言');
    await say(page, '消す発言');
    const line = page.locator('chat-tab chat-message').filter({ hasText: '消す発言' });
    await line.locator('.msg-text').hover();
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
