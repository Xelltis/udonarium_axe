import { expect, test } from '@playwright/test';

import { chatInput, expectChatText, openChatSettingsMenuItem, waitAppReady } from './helpers';

test.describe('the chat tools over a line', () => {
  test.beforeEach(async ({ page }) => {
    await waitAppReady(page);
  });

  test('are arranged from the chat settings, and the line shows the arrangement', async ({ page }) => {
    const textarea = chatInput(page);
    await textarea.fill('並べ替えの試し');
    await textarea.press('Enter');
    await expectChatText(textarea, '');
    const line = page.locator('chat-tab chat-message').filter({ hasText: '並べ替えの試し' }).first();
    await line.locator('.msg-text').hover();
    await expect(line.getByTestId('chat-message-action-reply')).toBeVisible();
    await expect(line.getByTestId('chat-message-action-copy')).toHaveCount(0);

    await openChatSettingsMenuItem(page, 'チャット設定');
    await page.locator('chat-message-setting [data-testid="chat-open-chat-tools"]').click();
    const editor = page.locator('ui-panel').filter({ hasText: 'メニューの編集' });
    await expect(editor.getByTestId('menu-editor-row-chat:reply')).toBeVisible();
    await editor.getByTestId('menu-editor-remove-chat:reply').click();
    await editor.getByTestId('menu-editor-add').click();
    await editor.getByTestId('menu-command-list').locator('li').filter({ hasText: '本文をコピー' }).first().click();
    await expect(editor.getByTestId('menu-editor-row-chat:copyText')).toBeVisible();
    const settings = page.locator('ui-panel').filter({ has: page.locator('chat-message-setting') });
    for (const panel of [editor, settings]) {
      await panel.locator('.bg-ui-titlebar button', { hasText: 'close' }).first().dispatchEvent('click');
      await expect(panel).toHaveCount(0);
    }

    await line.locator('.msg-text').hover();
    await expect(line.getByTestId('chat-message-action-copy')).toBeVisible();
    await expect(line.getByTestId('chat-message-action-reply')).toHaveCount(0);
    await expect(line.getByTestId('chat-message-action-more')).toBeVisible();
  });
});
