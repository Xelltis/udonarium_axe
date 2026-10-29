import { expect, Page, test } from '@playwright/test';

import { chatInput, expectChatText, openChatSettingsMenuItem } from '../helpers';
import { prepare } from './fixtures';

/** Sets one of the chat settings and shuts the panel again, so it covers nothing that is shot. */
async function setChatSetting(page: Page, name: string, value: string) {
  await openChatSettingsMenuItem(page, 'チャット設定');
  const setting = page.locator('chat-message-setting');
  await setting.locator(`select[name="${name}"]`).selectOption(value);
  await page.locator('ui-panel', { has: setting }).locator('.bg-ui-titlebar button').last().dispatchEvent('click');
  await expect(setting).toHaveCount(0);
}

async function say(page: Page, line: string) {
  const textarea = chatInput(page);
  await textarea.fill(line);
  await textarea.press('Enter');
  await expectChatText(textarea, '');
}

test('ruby laid out 1:2:1, together in the middle and from the first letter', async ({ page }) => {
  await prepare(page);
  await page.evaluate(() => document.documentElement.style.setProperty('--chat-font-size', '24px'));
  await say(page, '|一二三四五《あい》と|漢字《かん|じ》と|日《にちようび》');
  const message = page.locator('chat-tab chat-message').filter({ hasText: '一二三四五' }).locator('.msg-text');
  await expect(message).toBeVisible();
  await page.mouse.move(1279, 799);
  await expect(message).toHaveScreenshot('chat-ruby-even.png', { maxDiffPixels: 4 });

  await setChatSetting(page, 'ruby-spacing', 'tight');
  await page.mouse.move(1279, 799);
  await expect(message).toHaveScreenshot('chat-ruby-tight.png', { maxDiffPixels: 4 });

  await setChatSetting(page, 'ruby-align', 'start');
  await page.mouse.move(1279, 799);
  await expect(message).toHaveScreenshot('chat-ruby-start.png', { maxDiffPixels: 4 });
});
