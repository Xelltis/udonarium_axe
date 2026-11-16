import { expect, Page, test } from '@playwright/test';

import { openChatSettingsMenuItem, say } from '../helpers';
import { prepare, waitChatEditor } from './fixtures';

/** Sets one of the chat settings and shuts the panel again, so it covers nothing that is shot. */
async function setChatSetting(page: Page, name: string, value: string) {
  await openChatSettingsMenuItem(page, 'チャット設定');
  const setting = page.locator('chat-message-setting');
  await setting.locator(`select[name="${name}"]`).selectOption(value);
  await page.locator('ui-panel', { has: setting }).getByTestId('panel-close').dispatchEvent('click');
  await expect(setting).toHaveCount(0);
}

test('ruby laid out 1:2:1, together in the middle and from the first letter', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => document.documentElement.style.setProperty('--chat-font-size', '24px'));
  await waitChatEditor(page);
  await say(page, '|一二三四五《あい》と|漢字《かん|じ》と|日《にちようび》');
  const message = page
    .locator('chat-tab chat-message')
    .filter({ hasText: '一二三四五' })
    .getByTestId('chat-message-text');
  await expect(message).toBeVisible();
  await page.mouse.move(1279, 799);
  await expect(message).toHaveScreenshot('chat-ruby-even.png');

  await setChatSetting(page, 'ruby-spacing', 'tight');
  await page.mouse.move(1279, 799);
  await expect(message).toHaveScreenshot('chat-ruby-tight.png');

  await setChatSetting(page, 'ruby-align', 'start');
  await page.mouse.move(1279, 799);
  await expect(message).toHaveScreenshot('chat-ruby-start.png');
});
